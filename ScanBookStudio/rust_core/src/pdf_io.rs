use image::codecs::jpeg::JpegEncoder;
use image::RgbImage;
use lopdf::content::{Content, Operation};
use lopdf::{dictionary, Document, Object, Stream};
use std::collections::HashMap;
use std::path::Path;

pub struct IllustrationPatch {
    pub x: u32,
    pub y: u32, // top-left pixel coordinate in page image
    pub img: RgbImage,
}

pub struct PdfPageInput {
    pub img: RgbImage,
    pub dpi: u32,
    pub jpeg_quality: u8,
    pub export_format: String, // "jpg", "png_lossless", "tiff_lossless", "vector"
    pub is_bw: bool,
    pub patches: Vec<IllustrationPatch>,
}

/// Builds a multi-page PDF supporting JPEG, lossless PNG/TIFF-style FlateDecode (1-bit/8-bit),
/// true vector text contours (even-odd paths), and overlaid color/gray illustration patches.
pub fn build_pdf(pages: Vec<PdfPageInput>, out_path: &Path) -> Result<(), String> {
    let mut doc = Document::with_version("1.5");
    let pages_id = doc.new_object_id();
    let mut page_ids = Vec::with_capacity(pages.len());

    for (idx, p) in pages.into_iter().enumerate() {
        let (w_px, h_px) = p.img.dimensions();
        let dpi = p.dpi.clamp(72, 1200) as f32;
        let w_pt = (w_px as f32 / dpi) * 72.0;
        let h_pt = (h_px as f32 / dpi) * 72.0;

        let mut xobjects = dictionary! {};
        let mut ops: Vec<Operation> = Vec::new();
        let fmt = p.export_format.as_str();

        if fmt == "vector" && p.is_bw {
            // White page background + exact vector paths for black text
            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new("1", vec![])); // fallback ignored; set fill rgb below
            ops.pop();
            ops.push(Operation::new("rg", vec![1.0.into(), 1.0.into(), 1.0.into()]));
            ops.push(Operation::new("re", vec![0.into(), 0.into(), w_pt.into(), h_pt.into()]));
            ops.push(Operation::new("f", vec![]));
            ops.push(Operation::new("rg", vec![0.0.into(), 0.0.into(), 0.0.into()]));
            append_vector_bw_ops(&p.img, w_pt, h_pt, &mut ops);
            ops.push(Operation::new("Q", vec![]));
        } else {
            let img_id = match fmt {
                "tiff_lossless" if p.is_bw => add_1bit_lossless_image(&mut doc, &p.img),
                "png_lossless" | "tiff_lossless" => add_8bit_lossless_image(&mut doc, &p.img, p.is_bw),
                _ => add_jpeg_image(&mut doc, &p.img, p.jpeg_quality, idx)?,
            };
            xobjects.set("Im0", img_id);
            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new("cm", vec![w_pt.into(), 0.into(), 0.into(), h_pt.into(), 0.into(), 0.into()]));
            ops.push(Operation::new("Do", vec![Object::Name(b"Im0".to_vec())]));
            ops.push(Operation::new("Q", vec![]));
        }

        // Overlay extracted illustration patches (always raster color/gray, never vectorized or binarized)
        let use_lossless_patch = fmt != "jpg";
        for (pi, patch) in p.patches.iter().enumerate() {
            let (pw, ph) = patch.img.dimensions();
            if pw == 0 || ph == 0 || w_px == 0 || h_px == 0 {
                continue;
            }
            let patch_id = if use_lossless_patch {
                add_8bit_lossless_image(&mut doc, &patch.img, false)
            } else {
                add_jpeg_image(&mut doc, &patch.img, p.jpeg_quality.max(90), idx)?
            };
            let name = format!("ImP{}", pi);
            xobjects.set(name.as_bytes(), patch_id);

            let px_pt = (patch.x as f32 / w_px as f32) * w_pt;
            let pw_pt = (pw as f32 / w_px as f32) * w_pt;
            let ph_pt = (ph as f32 / h_px as f32) * h_pt;
            let py_pt = h_pt - ((patch.y + ph) as f32 / h_px as f32) * h_pt;

            ops.push(Operation::new("q", vec![]));
            ops.push(Operation::new("cm", vec![pw_pt.into(), 0.into(), 0.into(), ph_pt.into(), px_pt.into(), py_pt.into()]));
            ops.push(Operation::new("Do", vec![Object::Name(name.into_bytes())]));
            ops.push(Operation::new("Q", vec![]));
        }

        let content = Content { operations: ops };
        let content_bytes = content
            .encode()
            .map_err(|e| format!("PDF content encode failed: {}", e))?;
        let content_id = doc.add_object(Stream::new(dictionary! {}, content_bytes));

        let resources_id = doc.add_object(dictionary! {
            "XObject" => xobjects,
        });

        let page_id = doc.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => pages_id,
            "MediaBox" => vec![0.into(), 0.into(), w_pt.into(), h_pt.into()],
            "Contents" => content_id,
            "Resources" => resources_id,
        });
        page_ids.push(page_id);
    }

    let kids: Vec<Object> = page_ids.iter().map(|&id| id.into()).collect();
    doc.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Count" => kids.len() as i64,
            "Kids" => kids,
        }),
    );

    let catalog_id = doc.add_object(dictionary! {
        "Type" => "Catalog",
        "Pages" => pages_id,
    });
    doc.trailer.set("Root", catalog_id);
    doc.compress();
    doc.save(out_path)
        .map_err(|e| format!("Failed to save PDF: {}", e))?;
    Ok(())
}

fn add_jpeg_image(doc: &mut Document, img: &RgbImage, quality: u8, page_idx: usize) -> Result<lopdf::ObjectId, String> {
    let (w_px, h_px) = img.dimensions();
    let mut jpeg_bytes = Vec::new();
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, quality.clamp(10, 100));
    encoder
        .encode_image(img)
        .map_err(|e| format!("JPEG encode failed on page {}: {}", page_idx + 1, e))?;

    Ok(doc.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => w_px as i64,
            "Height" => h_px as i64,
            "ColorSpace" => "DeviceRGB",
            "BitsPerComponent" => 8,
            "Filter" => "DCTDecode",
        },
        jpeg_bytes,
    )))
}

fn add_8bit_lossless_image(doc: &mut Document, img: &RgbImage, grayscale: bool) -> lopdf::ObjectId {
    let (w_px, h_px) = img.dimensions();
    if grayscale {
        let mut raw = Vec::with_capacity((w_px * h_px) as usize);
        for p in img.pixels() {
            let luma = ((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8;
            raw.push(luma);
        }
        doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w_px as i64,
                "Height" => h_px as i64,
                "ColorSpace" => "DeviceGray",
                "BitsPerComponent" => 8,
            },
            raw,
        ))
    } else {
        doc.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => w_px as i64,
                "Height" => h_px as i64,
                "ColorSpace" => "DeviceRGB",
                "BitsPerComponent" => 8,
            },
            img.as_raw().clone(),
        ))
    }
}

fn add_1bit_lossless_image(doc: &mut Document, img: &RgbImage) -> lopdf::ObjectId {
    let (w_px, h_px) = img.dimensions();
    let row_bytes = ((w_px + 7) / 8) as usize;
    let mut packed = vec![0u8; row_bytes * h_px as usize];
    for y in 0..h_px {
        let row_off = y as usize * row_bytes;
        for x in 0..w_px {
            let p = img.get_pixel(x, y);
            let is_white = p[0] >= 128;
            if is_white {
                packed[row_off + (x as usize >> 3)] |= 0x80u8 >> (x & 7);
            }
        }
    }
    doc.add_object(Stream::new(
        dictionary! {
            "Type" => "XObject",
            "Subtype" => "Image",
            "Width" => w_px as i64,
            "Height" => h_px as i64,
            "ColorSpace" => "DeviceGray",
            "BitsPerComponent" => 1,
        },
        packed,
    ))
}

/// Traces exact boundary contours of black pixels on a B&W image, simplifies with
/// Ramer-Douglas-Peucker, and emits PDF vector path operations using even-odd fill (f*).
fn append_vector_bw_ops(img: &RgbImage, w_pt: f32, h_pt: f32, ops: &mut Vec<Operation>) {
    let (w, h) = img.dimensions();
    if w == 0 || h == 0 {
        return;
    }
    let wu = w as usize;
    let hu = h as usize;
    let is_black = |x: i32, y: i32| -> bool {
        if x < 0 || y < 0 || x >= w as i32 || y >= h as i32 {
            return false;
        }
        img.get_pixel(x as u32, y as u32)[0] < 128
    };

    // Directed boundary edges on the (w+1) x (h+1) corner grid
    // Keeping black on the right side of each directed edge
    let mut adj: HashMap<(i32, i32), Vec<(i32, i32)>> = HashMap::new();
    for y in 0..=hu as i32 {
        for x in 0..wu as i32 {
            let top = is_black(x, y - 1);
            let bot = is_black(x, y);
            if !top && bot {
                adj.entry((x, y)).or_default().push((x + 1, y));
            } else if top && !bot {
                adj.entry((x + 1, y)).or_default().push((x, y));
            }
        }
    }
    for y in 0..hu as i32 {
        for x in 0..=wu as i32 {
            let left = is_black(x - 1, y);
            let right = is_black(x, y);
            if !left && right {
                adj.entry((x, y + 1)).or_default().push((x, y));
            } else if left && !right {
                adj.entry((x, y)).or_default().push((x, y + 1));
            }
        }
    }

    let sx_scale = w_pt / w as f32;
    let sy_scale = h_pt / h as f32;

    let keys: Vec<(i32, i32)> = adj.keys().copied().collect();
    let mut has_paths = false;
    let mut path_count = 0usize;

    for start in keys {
        loop {
            let next_opt = adj.get_mut(&start).and_then(|v| v.pop());
            let Some(mut curr) = next_opt else { break; };
            let mut loop_pts = vec![start, curr];
            let mut prev = start;
            while curr != start {
                let Some(cands) = adj.get_mut(&curr) else { break; };
                if cands.is_empty() {
                    break;
                }
                // Prefer turning right/straight to keep loops clean at 4-way vertices
                let next = if cands.len() == 1 {
                    cands.pop().unwrap()
                } else {
                    let dx = curr.0 - prev.0;
                    let dy = curr.1 - prev.1;
                    let mut best_i = 0;
                    let mut best_score = i32::MIN;
                    for (i, &(nx, ny)) in cands.iter().enumerate() {
                        let ndx = nx - curr.0;
                        let ndy = ny - curr.1;
                        let cross = dx * ndy - dy * ndx; // right turn preference
                        let dot = dx * ndx + dy * ndy;
                        let score = if cross > 0 { 3 } else if dot > 0 { 2 } else { 1 };
                        if score > best_score {
                            best_score = score;
                            best_i = i;
                        }
                    }
                    cands.swap_remove(best_i)
                };
                prev = curr;
                curr = next;
                if curr != start {
                    loop_pts.push(curr);
                }
            }

            if loop_pts.len() < 4 {
                continue;
            }
            let simplified = rdp_simplify_closed(&loop_pts, 0.45);
            if simplified.len() < 3 {
                continue;
            }
            let (p0x, p0y) = simplified[0];
            ops.push(Operation::new(
                "m",
                vec![(p0x as f32 * sx_scale).into(), (h_pt - p0y as f32 * sy_scale).into()],
            ));
            for &(px, py) in &simplified[1..] {
                ops.push(Operation::new(
                    "l",
                    vec![(px as f32 * sx_scale).into(), (h_pt - py as f32 * sy_scale).into()],
                ));
            }
            ops.push(Operation::new("h", vec![]));
            has_paths = true;
            path_count += 1;

            // Periodically flush fill to avoid huge PDF path stack limits
            if path_count >= 1500 {
                ops.push(Operation::new("f*", vec![]));
                has_paths = false;
                path_count = 0;
            }
        }
    }

    if has_paths {
        ops.push(Operation::new("f*", vec![]));
    }
}

fn rdp_simplify_closed(pts: &[(i32, i32)], eps: f32) -> Vec<(i32, i32)> {
    // First remove collinear intermediate points
    let mut col = Vec::with_capacity(pts.len());
    let n = pts.len();
    for i in 0..n {
        let a = pts[(i + n - 1) % n];
        let b = pts[i];
        let c = pts[(i + 1) % n];
        let cross = (b.0 - a.0) * (c.1 - b.1) - (b.1 - a.1) * (c.0 - b.0);
        if cross != 0 {
            col.push(b);
        }
    }
    if col.len() <= 4 {
        return col;
    }
    // Split at farthest point from first point and run open RDP on both halves
    let p0 = col[0];
    let mut far_idx = 0;
    let mut far_d2 = -1i64;
    for (i, &p) in col.iter().enumerate().skip(1) {
        let dx = (p.0 - p0.0) as i64;
        let dy = (p.1 - p0.1) as i64;
        let d2 = dx * dx + dy * dy;
        if d2 > far_d2 {
            far_d2 = d2;
            far_idx = i;
        }
    }
    let mut h1 = Vec::new();
    rdp_open(&col[0..=far_idx], eps, &mut h1);
    let mut tail = col[far_idx..].to_vec();
    tail.push(col[0]);
    let mut h2 = Vec::new();
    rdp_open(&tail, eps, &mut h2);

    let mut res = h1;
    if h2.len() > 2 {
        res.extend_from_slice(&h2[1..h2.len() - 1]);
    }
    res
}

fn rdp_open(pts: &[(i32, i32)], eps: f32, out: &mut Vec<(i32, i32)>) {
    if pts.len() <= 2 {
        out.extend_from_slice(pts);
        return;
    }
    let a = pts[0];
    let b = pts[pts.len() - 1];
    let dx = (b.0 - a.0) as f32;
    let dy = (b.1 - a.1) as f32;
    let len = (dx * dx + dy * dy).sqrt();
    let mut max_d = -1.0f32;
    let mut max_i = 0;
    for (i, &p) in pts.iter().enumerate().take(pts.len() - 1).skip(1) {
        let d = if len < 1e-6 {
            (((p.0 - a.0).pow(2) + (p.1 - a.1).pow(2)) as f32).sqrt()
        } else {
            ((dy * p.0 as f32 - dx * p.1 as f32 + b.0 as f32 * a.1 as f32 - b.1 as f32 * a.0 as f32).abs()) / len
        };
        if d > max_d {
            max_d = d;
            max_i = i;
        }
    }
    if max_d > eps {
        let mut left = Vec::new();
        rdp_open(&pts[..=max_i], eps, &mut left);
        let mut right = Vec::new();
        rdp_open(&pts[max_i..], eps, &mut right);
        out.extend_from_slice(&left[..left.len() - 1]);
        out.extend_from_slice(&right);
    } else {
        out.push(a);
        out.push(b);
    }
}
