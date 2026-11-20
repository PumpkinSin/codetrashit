mod params;
mod pdf_io;
mod pipeline;

use params::EnhanceParams;
use pdf_io::{build_pdf, PdfPageInput};
use rayon::prelude::*;
use serde::Deserialize;
use std::cell::RefCell;
use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;

static EXPORT_DONE: AtomicUsize = AtomicUsize::new(0);
static EXPORT_TOTAL: AtomicUsize = AtomicUsize::new(0);
static EXPORT_CANCEL: AtomicBool = AtomicBool::new(false);
static EXPORT_PAUSE: AtomicBool = AtomicBool::new(false);

thread_local! {
    static LAST_ERR: RefCell<CString> = RefCell::new(CString::new("").unwrap());
}

fn set_err(msg: &str) {
    LAST_ERR.with(|e| {
        *e.borrow_mut() = CString::new(msg).unwrap_or_else(|_| CString::new("error").unwrap());
    });
}

unsafe fn cstr_to_str<'a>(p: *const c_char) -> Result<&'a str, &'static str> {
    if p.is_null() {
        return Err("null pointer");
    }
    CStr::from_ptr(p).to_str().map_err(|_| "invalid utf8")
}

#[no_mangle]
pub extern "C" fn cep_last_error() -> *const c_char {
    LAST_ERR.with(|e| e.borrow().as_ptr())
}

#[no_mangle]
pub unsafe extern "C" fn cep_free_bytes(ptr: *mut u8, len: usize) {
    if !ptr.is_null() && len > 0 {
        let _ = Vec::from_raw_parts(ptr, len, len);
    }
}

/// Analyzes the image at `input_path` and returns a JSON string: {"params": {...}, "summary": "..."}.
#[no_mangle]
pub unsafe extern "C" fn cep_auto_analyze_page(
    input_path: *const c_char,
    out_len: *mut usize,
) -> *mut u8 {
    let path = match cstr_to_str(input_path) {
        Ok(s) => s,
        Err(e) => { set_err(e); return std::ptr::null_mut(); }
    };
    let src = match image::open(path) {
        Ok(i) => i,
        Err(e) => { set_err(&format!("Open failed: {}", e)); return std::ptr::null_mut(); }
    };
    let (params, summary) = pipeline::analyze_page_auto_params(&src);
    let payload = serde_json::json!({
        "params": params,
        "summary": summary,
    })
    .to_string();

    let mut bytes = payload.into_bytes();
    let len = bytes.len();
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    if !out_len.is_null() {
        *out_len = len;
    }
    ptr
}

/// Detects book page crop_box and center spine split_ratio, returning JSON.
#[no_mangle]
pub unsafe extern "C" fn cep_auto_detect_crop_split(
    input_path: *const c_char,
    out_len: *mut usize,
) -> *mut u8 {
    let path = match cstr_to_str(input_path) {
        Ok(s) => s,
        Err(e) => { set_err(e); return std::ptr::null_mut(); }
    };
    let src = match image::open(path) {
        Ok(i) => i,
        Err(e) => { set_err(&format!("Open failed: {}", e)); return std::ptr::null_mut(); }
    };
    let (crop_box, split_mode, split_ratio, summary) = pipeline::auto_detect_crop_and_split(&src);
    let payload = serde_json::json!({
        "crop_box": crop_box,
        "split_mode": split_mode,
        "split_ratio": split_ratio,
        "summary": summary,
    })
    .to_string();

    let mut bytes = payload.into_bytes();
    let len = bytes.len();
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    if !out_len.is_null() {
        *out_len = len;
    }
    ptr
}

/// Processes an image at `input_path` with `params_json` (downscaled to `max_dim`) and returns an RGBA8888 buffer.
/// Also writes 256-bin histogram to `out_hist` if non-null.
#[no_mangle]
pub unsafe extern "C" fn cep_process_preview(
    input_path: *const c_char,
    params_json: *const c_char,
    max_dim: u32,
    out_len: *mut usize,
    out_w: *mut u32,
    out_h: *mut u32,
    out_hist: *mut u32,
) -> *mut u8 {
    let path = match cstr_to_str(input_path) {
        Ok(s) => s,
        Err(e) => { set_err(e); return std::ptr::null_mut(); }
    };
    let json_str = match cstr_to_str(params_json) {
        Ok(s) => s,
        Err(e) => { set_err(e); return std::ptr::null_mut(); }
    };
    let params: EnhanceParams = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => { set_err(&format!("Invalid params JSON: {}", e)); return std::ptr::null_mut(); }
    };

    let src = match image::open(path) {
        Ok(i) => i,
        Err(e) => { set_err(&format!("Failed to open image {}: {}", path, e)); return std::ptr::null_mut(); }
    };

    let rgb = pipeline::process_image(&src, &params, if max_dim > 0 { Some(max_dim) } else { None });
    if !out_hist.is_null() {
        let hist = pipeline::compute_histogram(&rgb);
        std::ptr::copy_nonoverlapping(hist.as_ptr(), out_hist, 256);
    }

    let (w, h) = rgb.dimensions();
    let mut rgba = Vec::with_capacity((w * h * 4) as usize);
    for p in rgb.pixels() {
        rgba.push(p[0]);
        rgba.push(p[1]);
        rgba.push(p[2]);
        rgba.push(255);
    }

    let len = rgba.len();
    let ptr = rgba.as_mut_ptr();
    std::mem::forget(rgba);
    if !out_len.is_null() { *out_len = len; }
    if !out_w.is_null() { *out_w = w; }
    if !out_h.is_null() { *out_h = h; }
    ptr
}

#[no_mangle]
pub unsafe extern "C" fn cep_process_and_save(
    input_path: *const c_char,
    output_path: *const c_char,
    params_json: *const c_char,
) -> c_int {
    let in_p = match cstr_to_str(input_path) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let out_p = match cstr_to_str(output_path) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let json_str = match cstr_to_str(params_json) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let params: EnhanceParams = match serde_json::from_str(json_str) {
        Ok(p) => p,
        Err(e) => { set_err(&format!("Invalid params JSON: {}", e)); return -1; }
    };

    let src = match image::open(in_p) {
        Ok(i) => i,
        Err(e) => { set_err(&format!("Open failed: {}", e)); return -2; }
    };
    let out = pipeline::process_image(&src, &params, None);
    if let Err(e) = out.save(out_p) {
        set_err(&format!("Save failed: {}", e));
        return -3;
    }
    0
}

#[derive(Deserialize)]
struct BatchPdfItem {
    input_path: String,
    params: EnhanceParams,
}

#[no_mangle]
pub unsafe extern "C" fn cep_export_get_progress(out_done: *mut u32, out_total: *mut u32) {
    if !out_done.is_null() {
        *out_done = EXPORT_DONE.load(Ordering::Relaxed) as u32;
    }
    if !out_total.is_null() {
        *out_total = EXPORT_TOTAL.load(Ordering::Relaxed) as u32;
    }
}

#[no_mangle]
pub extern "C" fn cep_export_set_pause(paused: c_int) {
    EXPORT_PAUSE.store(paused != 0, Ordering::Relaxed);
}

#[no_mangle]
pub extern "C" fn cep_export_cancel() {
    EXPORT_CANCEL.store(true, Ordering::Relaxed);
    EXPORT_PAUSE.store(false, Ordering::Relaxed);
}

/// Parallel-processes all pages with Rayon and writes a single compressed PDF to `output_pdf_path`.
/// Returns 0 on success, -10 if cancelled, other negative on error.
#[no_mangle]
pub unsafe extern "C" fn cep_prepare_layout_image(
    input_path: *const c_char,
    params_json: *const c_char,
    output_png_path: *const c_char,
    max_dim: c_int,
) -> c_int {
    let in_path = match cstr_to_str(input_path) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let p_str = match cstr_to_str(params_json) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let out_path = match cstr_to_str(output_png_path) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };

    let params: EnhanceParams = match serde_json::from_str(p_str) {
        Ok(p) => p,
        Err(e) => { set_err(&format!("Invalid params JSON: {}", e)); return -1; }
    };
    let src = match image::open(in_path) {
        Ok(img) => img,
        Err(e) => { set_err(&format!("Failed to open image: {}", e)); return -2; }
    };
    let aligned = pipeline::prepare_layout_image(&src, &params, max_dim.max(256) as u32);
    if let Err(e) = aligned.save(out_path) {
        set_err(&format!("Failed to save layout image: {}", e));
        return -3;
    }
    0
}

#[no_mangle]
pub unsafe extern "C" fn cep_batch_build_pdf(
    items_json: *const c_char,
    output_pdf_path: *const c_char,
) -> c_int {
    let items_str = match cstr_to_str(items_json) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };
    let out_pdf = match cstr_to_str(output_pdf_path) { Ok(s) => s, Err(e) => { set_err(e); return -1; } };

    let items: Vec<BatchPdfItem> = match serde_json::from_str(items_str) {
        Ok(v) => v,
        Err(e) => { set_err(&format!("Invalid batch JSON: {}", e)); return -1; }
    };

    EXPORT_DONE.store(0, Ordering::Relaxed);
    EXPORT_TOTAL.store(items.len(), Ordering::Relaxed);
    EXPORT_CANCEL.store(false, Ordering::Relaxed);
    EXPORT_PAUSE.store(false, Ordering::Relaxed);

    let results: Result<Vec<Vec<PdfPageInput>>, String> = items
        .into_par_iter()
        .map(|item| {
            while EXPORT_PAUSE.load(Ordering::Relaxed) {
                if EXPORT_CANCEL.load(Ordering::Relaxed) {
                    return Err("CANCELLED".to_string());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            if EXPORT_CANCEL.load(Ordering::Relaxed) {
                return Err("CANCELLED".to_string());
            }

            let src = image::open(&item.input_path)
                .map_err(|e| format!("Failed to open {}: {}", item.input_path, e))?;

            let effective_dpi = if item.params.page_preset == "original" || item.params.page_preset == "content_only" {
                ((item.params.target_dpi as f32) * (item.params.scale_percent / 100.0)).round().clamp(72.0, 1200.0) as u32
            } else {
                item.params.target_dpi
            };

            let mut out_pages = Vec::new();
            let is_double = item.params.split_mode == "double_ltr" || item.params.split_mode == "double_rtl";
            if is_double && item.params.split_side == "both" {
                let order = if item.params.split_mode == "double_ltr" { ["left", "right"] } else { ["right", "left"] };
                for side in order {
                    let mut p = item.params.clone();
                    p.split_side = side.to_string();
                    let (processed, patches) = pipeline::process_image_with_illustrations(&src, &p, None);
                    out_pages.push(PdfPageInput {
                        img: processed,
                        dpi: effective_dpi,
                        jpeg_quality: p.jpeg_quality,
                        export_format: p.export_format.clone(),
                        is_bw: p.color_depth == "bw",
                        patches,
                    });
                }
            } else {
                let (processed, patches) = pipeline::process_image_with_illustrations(&src, &item.params, None);
                out_pages.push(PdfPageInput {
                    img: processed,
                    dpi: effective_dpi,
                    jpeg_quality: item.params.jpeg_quality,
                    export_format: item.params.export_format.clone(),
                    is_bw: item.params.color_depth == "bw",
                    patches,
                });
            }
            EXPORT_DONE.fetch_add(1, Ordering::Relaxed);
            Ok(out_pages)
        })
        .collect();

    match results {
        Ok(nested) => {
            if EXPORT_CANCEL.load(Ordering::Relaxed) {
                return -10;
            }
            let pages: Vec<PdfPageInput> = nested.into_iter().flatten().collect();
            if let Err(e) = build_pdf(pages, Path::new(out_pdf)) {
                set_err(&e);
                return -3;
            }
            0
        }
        Err(e) if e == "CANCELLED" => -10,
        Err(e) => {
            set_err(&e);
            -2
        }
    }
}
