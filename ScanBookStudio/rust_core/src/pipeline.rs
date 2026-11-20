use crate::params::EnhanceParams;
use crate::pdf_io::IllustrationPatch;
use image::{DynamicImage, GenericImageView, ImageBuffer, Rgb, RgbImage};

/// Main processing pipeline: takes a decoded DynamicImage and applies all enabled steps in order.
pub fn process_image(src: &DynamicImage, params: &EnhanceParams, max_preview_dim: Option<u32>) -> RgbImage {
    let (mut img, patches) = process_image_with_illustrations(src, params, max_preview_dim);
    for patch in patches {
        let (pw, ph) = patch.img.dimensions();
        let (iw, ih) = img.dimensions();
        for py in 0..ph {
            let dy = patch.y + py;
            if dy >= ih { break; }
            for px in 0..pw {
                let dx = patch.x + px;
                if dx >= iw { break; }
                img.put_pixel(dx, dy, *patch.img.get_pixel(px, py));
            }
        }
    }
    img
}

/// Full pipeline returning both the base layer (e.g. B&W text) and any extracted illustration patches
/// in the exact final page pixel coordinate space.
pub fn process_image_with_illustrations(
    src: &DynamicImage,
    params: &EnhanceParams,
    max_preview_dim: Option<u32>,
) -> (RgbImage, Vec<IllustrationPatch>) {
    // Optional downscale only for huge images (> max_preview_dim) using sharp Lanczos3
    let working = if let Some(max_d) = max_preview_dim {
        let (w, h) = src.dimensions();
        if w > max_d || h > max_d {
            src.resize(max_d, max_d, image::imageops::FilterType::Lanczos3)
        } else {
            src.clone()
        }
    } else {
        src.clone()
    };

    // 1. Rotation & Flip
    let mut img = apply_rotation_flip(working, params);

    // 2. Crop outer desk/fingers first (crop_box is in full rotated-image coordinates)
    let mut img = apply_crop(&img, params);

    // 2b. Split (single_gutter or double page), mapping split_ratio from full image into cropped region
    let mut split_params = params.clone();
    let crop_w = (params.crop_box[2] - params.crop_box[0]).max(0.05);
    split_params.split_ratio = ((params.split_ratio - params.crop_box[0]) / crop_w).clamp(0.1, 0.9);
    img = apply_split(&img, &split_params);

    // 2c. If UVDoc AI dewarp is enabled, apply 2D grid warp
    if params.uvdoc_enabled {
        if let Some(ref grid) = params.uvdoc_grid {
            if grid.len() == 45 * 31 * 2 {
                img = apply_uvdoc_grid(&img, grid, 31, 45);
            }
        }
    } else {
        // 3. Perspective 4-point warp (if enabled)
        if params.perspective_enabled {
            img = apply_perspective_warp(&img, &params.perspective_points);
        }

        // 4. Curved page dewarp (if enabled)
        if params.dewarp_enabled {
            img = apply_curve_dewarp(&img, &params.dewarp_top_y, &params.dewarp_bottom_y);
        }

        // 5. Deskew (auto or manual)
        let angle = if params.auto_deskew {
            estimate_deskew_angle(&img)
        } else {
            params.deskew_angle
        };
        if angle.abs() > 0.05 {
            img = rotate_arbitrary(&img, angle);
        }
    }

    // 6b. Remove skin-toned fingers & their shadow halo in outer margins before illumination/binarization
    if params.remove_margin_fingers {
        remove_margin_fingers_fn(&mut img);
    }

    // 7. Color replace & Channel mix & Invert
    if params.color_replace_enabled {
        apply_color_replace(
            &mut img,
            params.color_replace_target,
            params.color_replace_to,
            params.color_replace_tolerance,
        );
    }
    if params.invert_colors {
        for p in img.pixels_mut() {
            p[0] = 255 - p[0];
            p[1] = 255 - p[1];
            p[2] = 255 - p[2];
        }
    }
    if params.channel_mix != "none" {
        apply_channel_mix(&mut img, &params.channel_mix);
    }

    // 8. Illumination / Shadow Removal
    if params.illumination_mode != "none" || params.shadow_remove_strength > 0.5 {
        apply_illumination_fix(&mut img, &params.illumination_mode, params.shadow_remove_strength);
    }

    // 9. Auto White Balance / Auto Levels / Auto Contrast / Auto Bleach
    if params.auto_white_balance {
        apply_auto_white_balance(&mut img);
    }

    // 9b. Upscale BEFORE tone/binarization when scale_percent > 100 (per CEP recommendation for crisp B&W!)
    if params.scale_percent > 101.0 {
        let cap = if max_preview_dim.is_some() { 3200 } else { 4500 };
        img = apply_scale(&img, params.scale_percent, &params.scale_filter, cap);
    }

    if params.auto_levels {
        apply_auto_levels(&mut img);
    }
    if params.auto_contrast {
        apply_auto_contrast(&mut img);
    }
    if params.auto_bleach {
        apply_auto_bleach(&mut img);
    }

    // 10. Tone LUT: Levels + Smooth Cubic Curve + Highlight Boost + Brightness + Contrast + Gamma + Light + Vibrance
    apply_tone_adjustments(&mut img, params);

    if params.post_process_hist {
        apply_auto_contrast(&mut img);
    }

    // 10b. Multi-scale detail enhancement
    if params.multi_scale_detail > 0.5 {
        img = apply_multi_scale_detail(&img, params.multi_scale_detail);
    }

    // 11. Morphology (Bold / Thin / Open / Close)
    if params.morph_op != "none" {
        img = apply_morphology(&img, &params.morph_op);
    }

    // 12. Gaussian Blur & Surface Blur (edge-preserving denoise)
    if params.gaussian_blur_radius > 0.1 {
        img = image::imageops::blur(&img, params.gaussian_blur_radius.clamp(0.1, 5.0));
    }
    if params.surface_blur_radius > 0 {
        for _ in 0..params.surface_blur_passes.clamp(1, 3) {
            img = apply_surface_blur(&img, params.surface_blur_radius, params.surface_blur_threshold);
        }
    }

    // 12b. Downscale when scale_percent < 100
    if params.scale_percent < 99.0 {
        img = apply_scale(&img, params.scale_percent, &params.scale_filter, 4500);
    }

    // 13. USM Sharpen (multi-pass)
    if params.usm_amount > 0.5 {
        for _ in 0..params.usm_passes.clamp(1, 3) {
            img = apply_usm_sharpen(&img, params.usm_amount, params.usm_radius, params.usm_threshold);
        }
    }

    // Snapshot pre-binarization color/gray image for synced illustration extraction
    let mut pre_bw = if params.extract_illustrations {
        Some(img.clone())
    } else {
        None
    };

    // 14. Color Depth / Binarization (Wolf / Otsu / Grayscale quantization + Despeckle / Line Removal / Deburr)
    img = apply_color_depth_and_binarize(&img, params);

    // 14b. Multi-grid per-line baseline straightening (works best after B&W / whitening!)
    if params.line_grid_dewarp {
        if let Some(grid) = compute_line_grid_dewarp(&img) {
            img = warp_with_line_grid(&img, &grid);
            if let Some(ref mut pb) = pre_bw {
                *pb = warp_with_line_grid(pb, &grid);
            }
        }
    }

    // 15. Page Layout (only when full-res export or non-original preset)
    if max_preview_dim.is_none() && params.page_preset != "original" && params.page_preset != "content_only" {
        img = apply_page_layout(&img, params);
        if let Some(ref mut pb) = pre_bw {
            *pb = apply_page_layout(pb, params);
        }
    }

    let patches = if let Some(ref pb) = pre_bw {
        if let Some(ref norm_boxes) = params.illustration_boxes {
            crop_normalized_patches(pb, norm_boxes)
        } else {
            detect_illustrations(&img, pb, params.filter_small_ornaments)
        }
    } else {
        Vec::new()
    };

    (img, patches)
}

/// Produces the geometrically-aligned pre-binarization color/gray image (Steps 1..4)
/// resized to `max_dim`, ready for PP-DocLayoutV3 illustration detection.
pub fn prepare_layout_image(src: &DynamicImage, params: &EnhanceParams, max_dim: u32) -> RgbImage {
    let mut p = params.clone();
    p.extract_illustrations = true;
    p.illustration_boxes = Some(Vec::new());
    let mut img = apply_rotation_flip(src.clone(), &p);
    img = apply_crop(&img, &p);
    let mut split_params = p.clone();
    let crop_w = (p.crop_box[2] - p.crop_box[0]).max(0.05);
    split_params.split_ratio = ((p.split_ratio - p.crop_box[0]) / crop_w).clamp(0.1, 0.9);
    img = apply_split(&img, &split_params);

    if p.uvdoc_enabled {
        if let Some(ref grid) = p.uvdoc_grid {
            if grid.len() == 45 * 31 * 2 {
                img = apply_uvdoc_grid(&img, grid, 31, 45);
            }
        }
    } else {
        if p.perspective_enabled {
            img = apply_perspective_warp(&img, &p.perspective_points);
        }
        if p.dewarp_enabled {
            img = apply_curve_dewarp(&img, &p.dewarp_top_y, &p.dewarp_bottom_y);
        }
        let angle = if p.auto_deskew { estimate_deskew_angle(&img) } else { p.deskew_angle };
        if angle.abs() > 0.05 {
            img = rotate_arbitrary(&img, angle);
        }
    }
    if p.remove_margin_fingers {
        remove_margin_fingers_fn(&mut img);
    }
    if p.illumination_mode != "none" || p.shadow_remove_strength > 0.5 {
        apply_illumination_fix(&mut img, &p.illumination_mode, p.shadow_remove_strength);
    }
    if p.line_grid_dewarp {
        let bw_tmp = apply_color_depth_and_binarize(&img, &p);
        if let Some(grid) = compute_line_grid_dewarp(&bw_tmp) {
            img = warp_with_line_grid(&img, &grid);
        }
    }
    if p.page_preset != "original" && p.page_preset != "content_only" {
        img = apply_page_layout(&img, &p);
    }
    let (w, h) = img.dimensions();
    if w > max_dim || h > max_dim {
        let dyn_img = DynamicImage::ImageRgb8(img);
        dyn_img.resize(max_dim, max_dim, image::imageops::FilterType::Triangle).to_rgb8()
    } else {
        img
    }
}

fn crop_normalized_patches(pre_bw: &RgbImage, boxes: &[[f32; 4]]) -> Vec<IllustrationPatch> {
    let (w, h) = pre_bw.dimensions();
    if w < 16 || h < 16 {
        return Vec::new();
    }
    let mut patches = Vec::with_capacity(boxes.len());
    for b in boxes {
        let x0 = (b[0].clamp(0.0, 1.0) * w as f32).floor() as u32;
        let y0 = (b[1].clamp(0.0, 1.0) * h as f32).floor() as u32;
        let x1 = (b[2].clamp(0.0, 1.0) * w as f32).ceil() as u32;
        let y1 = (b[3].clamp(0.0, 1.0) * h as f32).ceil() as u32;
        let pw = x1.saturating_sub(x0).min(w - x0);
        let ph = y1.saturating_sub(y0).min(h - y0);
        if pw < 16 || ph < 16 {
            continue;
        }
        let crop = image::imageops::crop_imm(pre_bw, x0, y0, pw, ph).to_image();
        patches.push(IllustrationPatch { x: x0, y: y0, img: crop });
    }
    patches
}

pub fn compute_histogram(img: &RgbImage) -> [u32; 256] {
    let mut hist = [0u32; 256];
    for p in img.pixels() {
        let luma = ((p[0] as u32 * 77 + p[1] as u32 * 150 + p[2] as u32 * 29) >> 8).min(255) as usize;
        hist[luma] += 1;
    }
    hist
}

fn apply_rotation_flip(img: DynamicImage, params: &EnhanceParams) -> RgbImage {
    let mut d = match ((params.rotation % 360) + 360) % 360 {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => img,
    };
    if params.flip_h {
        d = d.fliph();
    }
    if params.flip_v {
        d = d.flipv();
    }
    d.to_rgb8()
}

fn apply_split(img: &RgbImage, params: &EnhanceParams) -> RgbImage {
    let (w, h) = img.dimensions();
    if w < 10 || h < 10 {
        return img.clone();
    }
    match params.split_mode.as_str() {
        "double_ltr" | "double_rtl" => {
            let split_x = ((w as f32) * params.split_ratio.clamp(0.1, 0.9)) as u32;
            let take_left = match (params.split_mode.as_str(), params.split_side.as_str()) {
                ("double_ltr", "left") => true,
                ("double_ltr", "right") => false,
                ("double_rtl", "left") => false,
                ("double_rtl", "right") => true,
                _ => true,
            };
            if take_left {
                image::imageops::crop_imm(img, 0, 0, split_x.max(1), h).to_image()
            } else {
                image::imageops::crop_imm(img, split_x, 0, (w - split_x).max(1), h).to_image()
            }
        }
        "single_gutter" => {
            // Trim gutter edge based on split_ratio (if < 0.5 trim left, else trim right)
            if params.split_ratio < 0.5 {
                let x = ((w as f32) * params.split_ratio) as u32;
                image::imageops::crop_imm(img, x, 0, (w - x).max(1), h).to_image()
            } else {
                let rw = ((w as f32) * params.split_ratio) as u32;
                image::imageops::crop_imm(img, 0, 0, rw.max(1), h).to_image()
            }
        }
        _ => img.clone(),
    }
}

fn apply_crop(img: &RgbImage, params: &EnhanceParams) -> RgbImage {
    let (w, h) = img.dimensions();
    let [l, t, r, b] = params.crop_box;
    let x0 = ((l.clamp(0.0, 0.95)) * w as f32) as u32;
    let y0 = ((t.clamp(0.0, 0.95)) * h as f32) as u32;
    let x1 = ((r.clamp(l + 0.05, 1.0)) * w as f32) as u32;
    let y1 = ((b.clamp(t + 0.05, 1.0)) * h as f32) as u32;
    let cw = (x1.saturating_sub(x0)).max(1);
    let ch = (y1.saturating_sub(y0)).max(1);
    let mut cropped = if x0 > 0 || y0 > 0 || cw < w || ch < h {
        image::imageops::crop_imm(img, x0, y0, cw, ch).to_image()
    } else {
        img.clone()
    };

    if params.auto_crop_margin {
        cropped = auto_trim_white_borders(&cropped, params.speckle_padding_px);
    }
    cropped
}

fn auto_trim_white_borders(img: &RgbImage, pad: u32) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut min_x = w;
    let mut min_y = h;
    let mut max_x = 0u32;
    let mut max_y = 0u32;

    for y in 0..h {
        for x in 0..w {
            let p = img.get_pixel(x, y);
            let luma = (p[0] as u16 + p[1] as u16 + p[2] as u16) / 3;
            if luma < 235 {
                if x < min_x { min_x = x; }
                if x > max_x { max_x = x; }
                if y < min_y { min_y = y; }
                if y > max_y { max_y = y; }
            }
        }
    }
    if min_x >= max_x || min_y >= max_y {
        return img.clone();
    }
    let x0 = min_x.saturating_sub(pad);
    let y0 = min_y.saturating_sub(pad);
    let x1 = (max_x + pad).min(w - 1);
    let y1 = (max_y + pad).min(h - 1);
    image::imageops::crop_imm(img, x0, y0, (x1 - x0 + 1).max(1), (y1 - y0 + 1).max(1)).to_image()
}

/// Bilinear sample from RgbImage with white fallback outside bounds
#[inline]
fn sample_bilinear(img: &RgbImage, fx: f32, fy: f32) -> Rgb<u8> {
    let (w, h) = img.dimensions();
    if fx < 0.0 || fy < 0.0 || fx >= (w - 1) as f32 || fy >= (h - 1) as f32 {
        return Rgb([255, 255, 255]);
    }
    let x0 = fx.floor() as u32;
    let y0 = fy.floor() as u32;
    let dx = fx - x0 as f32;
    let dy = fy - y0 as f32;

    let p00 = img.get_pixel(x0, y0);
    let p10 = img.get_pixel(x0 + 1, y0);
    let p01 = img.get_pixel(x0, y0 + 1);
    let p11 = img.get_pixel(x0 + 1, y0 + 1);

    let mut out = [0u8; 3];
    for c in 0..3 {
        let v = (1.0 - dx) * (1.0 - dy) * p00[c] as f32
            + dx * (1.0 - dy) * p10[c] as f32
            + (1.0 - dx) * dy * p01[c] as f32
            + dx * dy * p11[c] as f32;
        out[c] = v.round().clamp(0.0, 255.0) as u8;
    }
    Rgb(out)
}

/// 4-point Perspective Homography Warp (TL, TR, BR, BL normalized)
fn apply_perspective_warp(img: &RgbImage, pts: &[[f32; 2]; 4]) -> RgbImage {
    let (w, h) = img.dimensions();
    let dst_pts = [[0.0f32, 0.0], [w as f32, 0.0], [w as f32, h as f32], [0.0, h as f32]];
    let src_pts = [
        [pts[0][0] * w as f32, pts[0][1] * h as f32],
        [pts[1][0] * w as f32, pts[1][1] * h as f32],
        [pts[2][0] * w as f32, pts[2][1] * h as f32],
        [pts[3][0] * w as f32, pts[3][1] * h as f32],
    ];

    if let Some(m) = solve_homography(&dst_pts, &src_pts) {
        let mut out = RgbImage::new(w, h);
        for y in 0..h {
            for x in 0..w {
                let fx = x as f32;
                let fy = y as f32;
                let denom = m[6] * fx + m[7] * fy + 1.0;
                if denom.abs() > 1e-6 {
                    let sx = (m[0] * fx + m[1] * fy + m[2]) / denom;
                    let sy = (m[3] * fx + m[4] * fy + m[5]) / denom;
                    out.put_pixel(x, y, sample_bilinear(img, sx, sy));
                } else {
                    out.put_pixel(x, y, Rgb([255, 255, 255]));
                }
            }
        }
        out
    } else {
        img.clone()
    }
}

fn solve_homography(src: &[[f32; 2]; 4], dst: &[[f32; 2]; 4]) -> Option<[f32; 8]> {
    let mut a = [[0.0f64; 9]; 8];
    for i in 0..4 {
        let sx = src[i][0] as f64;
        let sy = src[i][1] as f64;
        let dx = dst[i][0] as f64;
        let dy = dst[i][1] as f64;

        a[2 * i] = [sx, sy, 1.0, 0.0, 0.0, 0.0, -dx * sx, -dx * sy, dx];
        a[2 * i + 1] = [0.0, 0.0, 0.0, sx, sy, 1.0, -dy * sx, -dy * sy, dy];
    }

    for i in 0..8 {
        let mut max_row = i;
        for k in (i + 1)..8 {
            if a[k][i].abs() > a[max_row][i].abs() {
                max_row = k;
            }
        }
        a.swap(i, max_row);
        if a[i][i].abs() < 1e-9 {
            return None;
        }
        let pivot = a[i][i];
        for j in i..9 {
            a[i][j] /= pivot;
        }
        for k in 0..8 {
            if k != i {
                let factor = a[k][i];
                for j in i..9 {
                    a[k][j] -= factor * a[i][j];
                }
            }
        }
    }

    Some([
        a[0][8] as f32, a[1][8] as f32, a[2][8] as f32, a[3][8] as f32,
        a[4][8] as f32, a[5][8] as f32, a[6][8] as f32, a[7][8] as f32,
    ])
}

/// Applies a UVDoc 2D coordinate grid (gw x gh x 2 floats in [-1, 1]) at any output resolution.
fn apply_uvdoc_grid(img: &RgbImage, grid: &[f32], gw: usize, gh: usize) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    let wf = (w.saturating_sub(1)).max(1) as f32;
    let hf = (h.saturating_sub(1)).max(1) as f32;

    for y in 0..h {
        let gy_f = (y as f32 / hf) * (gh - 1) as f32;
        let gy0 = (gy_f.floor() as usize).min(gh - 1);
        let gy1 = (gy0 + 1).min(gh - 1);
        let dy = gy_f - gy0 as f32;

        for x in 0..w {
            let gx_f = (x as f32 / wf) * (gw - 1) as f32;
            let gx0 = (gx_f.floor() as usize).min(gw - 1);
            let gx1 = (gx0 + 1).min(gw - 1);
            let dx = gx_f - gx0 as f32;

            let idx00 = (gy0 * gw + gx0) * 2;
            let idx10 = (gy0 * gw + gx1) * 2;
            let idx01 = (gy1 * gw + gx0) * 2;
            let idx11 = (gy1 * gw + gx1) * 2;

            let nx = (1.0 - dx) * (1.0 - dy) * grid[idx00]
                + dx * (1.0 - dy) * grid[idx10]
                + (1.0 - dx) * dy * grid[idx01]
                + dx * dy * grid[idx11];
            let ny = (1.0 - dx) * (1.0 - dy) * grid[idx00 + 1]
                + dx * (1.0 - dy) * grid[idx10 + 1]
                + (1.0 - dx) * dy * grid[idx01 + 1]
                + dx * dy * grid[idx11 + 1];

            let sx = ((nx + 1.0) * 0.5) * wf;
            let sy = ((ny + 1.0) * 0.5) * hf;
            out.put_pixel(x, y, sample_bilinear(img, sx, sy));
        }
    }
    out
}

/// Curved Page Dewarp using quadratic interpolation along top and bottom 3-point curves
fn apply_curve_dewarp(img: &RgbImage, top_y: &[f32; 3], bot_y: &[f32; 3]) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    let wf = w.max(1) as f32;
    let hf = h.max(1) as f32;

    for x in 0..w {
        let t = x as f32 / wf;
        // Quadratic Lagrange interpolation through (0, y0), (0.5, y1), (1.0, y2)
        let b0 = 2.0 * (t - 0.5) * (t - 1.0);
        let b1 = -4.0 * t * (t - 1.0);
        let b2 = 2.0 * t * (t - 0.5);

        let ty = (b0 * top_y[0] + b1 * top_y[1] + b2 * top_y[2]) * hf;
        let by = (b0 * bot_y[0] + b1 * bot_y[1] + b2 * bot_y[2]) * hf;

        for y in 0..h {
            let v = y as f32 / hf;
            let sy = ty + v * (by - ty);
            out.put_pixel(x, y, sample_bilinear(img, x as f32, sy));
        }
    }
    out
}

/// Estimates page skew angle (-12..+12 deg) by pairing adjacent character centroids
/// in text lines and finding the dominant baseline angle histogram peak.
fn estimate_deskew_angle(img: &RgbImage) -> f32 {
    let thumb = image::imageops::resize(img, 800, 800, image::imageops::FilterType::Triangle);
    let (w, h) = thumb.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    if wu < 40 || hu < 40 {
        return 0.0;
    }

    // Fast local adaptive binarization (integral image, window=25) so shadows don't hide characters
    let mut gray = vec![0u8; wu * hu];
    for (i, p) in thumb.pixels().enumerate() {
        gray[i] = ((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8;
    }
    let sw = wu + 1;
    let mut integ = vec![0u32; sw * (hu + 1)];
    for y in 1..=hu {
        let mut row_s = 0u32;
        for x in 1..=wu {
            row_s += gray[(y - 1) * wu + (x - 1)] as u32;
            integ[y * sw + x] = integ[(y - 1) * sw + x] + row_s;
        }
    }
    let r = 12isize;
    let mut bin = vec![false; wu * hu]; // true = dark ink
    for y in 0..hu {
        let y0 = (y as isize - r).max(0) as usize;
        let y1 = (y as isize + r).min(hu as isize - 1) as usize + 1;
        for x in 0..wu {
            let x0 = (x as isize - r).max(0) as usize;
            let x1 = (x as isize + r).min(wu as isize - 1) as usize + 1;
            let area = ((x1 - x0) * (y1 - y0)) as u32;
            let s = integ[y1 * sw + x1] - integ[y0 * sw + x1] - integ[y1 * sw + x0] + integ[y0 * sw + x0];
            let mean = s / area.max(1);
            bin[y * wu + x] = (gray[y * wu + x] as u32 + 14) < mean;
        }
    }

    // Extract character-sized connected components (ignore outer 5% border)
    let mut visited = vec![false; wu * hu];
    let mut chars: Vec<(f32, f32)> = Vec::new();
    let mx = wu / 20;
    let my = hu / 20;

    for sy in my..(hu - my) {
        for sx in mx..(wu - mx) {
            let sidx = sy * wu + sx;
            if visited[sidx] || !bin[sidx] {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            visited[sidx] = true;
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            let mut cnt = 0usize;
            while let Some((cx, cy)) = stack.pop() {
                cnt += 1;
                if cx < min_x { min_x = cx; }
                if cx > max_x { max_x = cx; }
                if cy < min_y { min_y = cy; }
                if cy > max_y { max_y = cy; }
                if cnt > 900 { continue; }
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < wu && ny < hu {
                        let nidx = ny * wu + nx;
                        if !visited[nidx] && bin[nidx] {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            let bw = max_x - min_x + 1;
            let bh = max_y - min_y + 1;
            if bw >= 3 && bw <= 38 && bh >= 4 && bh <= 38 && cnt >= 6 {
                // Use bottom-center of character box as baseline anchor
                chars.push(((min_x + max_x) as f32 * 0.5, max_y as f32));
            }
        }
    }

    if chars.len() < 12 {
        return 0.0;
    }

    // Sort by X so pairing adjacent characters in the same text line is O(N * k)
    chars.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

    // Angle histogram from -12.0 to +12.0 deg in 0.1 deg bins (241 bins)
    let mut bins = vec![0.0f32; 241];
    for i in 0..chars.len() {
        let (x1, y1) = chars[i];
        for j in (i + 1)..chars.len() {
            let dx = chars[j].0 - x1;
            if dx > 42.0 { break; }
            if dx < 5.0 { continue; }
            let dy = chars[j].1 - y1;
            if dy.abs() > 10.0 { continue; }
            let deg = dy.atan2(dx).to_degrees();
            if deg.abs() <= 12.0 {
                let b = ((deg + 12.0) * 10.0).round() as usize;
                if b < 241 {
                    bins[b] += 1.0;
                    if b > 0 { bins[b - 1] += 0.5; }
                    if b + 1 < 241 { bins[b + 1] += 0.5; }
                }
            }
        }
    }

    let mut best_b = 120usize;
    let mut best_v = 0.0f32;
    for (b, &v) in bins.iter().enumerate() {
        if v > best_v {
            best_v = v;
            best_b = b;
        }
    }
    if best_v < 8.0 {
        return 0.0;
    }
    // Positive angle rotates counter-clockwise to level tilted line
    let detected_deg = (best_b as f32) * 0.1 - 12.0;
    -detected_deg
}

fn rotate_arbitrary(img: &RgbImage, angle_deg: f32) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    let rad = (-angle_deg).to_radians();
    let cos_a = rad.cos();
    let sin_a = rad.sin();
    let cx = w as f32 / 2.0;
    let cy = h as f32 / 2.0;

    for y in 0..h {
        for x in 0..w {
            let dx = x as f32 - cx;
            let dy = y as f32 - cy;
            let sx = dx * cos_a - dy * sin_a + cx;
            let sy = dx * sin_a + dy * cos_a + cy;
            out.put_pixel(x, y, sample_bilinear(img, sx, sy));
        }
    }
    out
}

fn apply_color_replace(img: &mut RgbImage, target: [u8; 3], to: [u8; 3], tol: u8) {
    let tol_sq = (tol as i32) * (tol as i32) * 3;
    for p in img.pixels_mut() {
        let dr = p[0] as i32 - target[0] as i32;
        let dg = p[1] as i32 - target[1] as i32;
        let db = p[2] as i32 - target[2] as i32;
        if dr * dr + dg * dg + db * db <= tol_sq {
            p[0] = to[0];
            p[1] = to[1];
            p[2] = to[2];
        }
    }
}

fn apply_channel_mix(img: &mut RgbImage, mode: &str) {
    for p in img.pixels_mut() {
        let (r, g, b) = (p[0] as f32, p[1] as f32, p[2] as f32);
        let v = match mode {
            "bt601" => 0.299 * r + 0.587 * g + 0.114 * b,
            "bt709" => 0.2126 * r + 0.7152 * g + 0.0722 * b,
            "red" => r,
            "green" => g,
            "blue" => b,
            "sepia_bleach" => {
                // Yellow-filter style bleach that whitens yellowed paper
                (0.45 * r + 0.45 * g + 0.10 * b) * 1.05
            }
            _ => continue,
        };
        let u = v.round().clamp(0.0, 255.0) as u8;
        p[0] = u;
        p[1] = u;
        p[2] = u;
    }
}

/// Fast local background estimation via downsampled morphological dilation + blur, then division normalization
fn apply_illumination_fix(img: &mut RgbImage, mode: &str, strength: f32) {
    let (w, h) = img.dimensions();
    if w < 16 || h < 16 {
        return;
    }
    let scale = 8u32;
    let sw = (w / scale).max(4);
    let sh = (h / scale).max(4);

    // Build coarse max-filter background map (ignores dark ink, captures paper illumination)
    let mut bg_coarse = RgbImage::new(sw, sh);
    for by in 0..sh {
        for bx in 0..sw {
            let mut max_rgb = [0u8; 3];
            let x0 = bx * scale;
            let y0 = by * scale;
            for dy in 0..scale {
                for dx in 0..scale {
                    let px = (x0 + dx).min(w - 1);
                    let py = (y0 + dy).min(h - 1);
                    let p = img.get_pixel(px, py);
                    for c in 0..3 {
                        if p[c] > max_rgb[c] { max_rgb[c] = p[c]; }
                    }
                }
            }
            bg_coarse.put_pixel(bx, by, Rgb(max_rgb));
        }
    }

    // Smooth the coarse background with a 5x5 box pass
    let bg_smooth = box_blur_rgb(&bg_coarse, 3);
    let bg_full = image::imageops::resize(&bg_smooth, w, h, image::imageops::FilterType::Triangle);

    let alpha = if strength > 0.5 {
        (strength / 100.0).clamp(0.2, 1.0)
    } else {
        1.0
    };

    let keep_red_seal = mode == "bw_red_seal";
    let force_bw_luma = mode == "bw_text";

    for (x, y, p) in img.enumerate_pixels_mut() {
        let bg = bg_full.get_pixel(x, y);
        let mut nr = ((p[0] as f32 / (bg[0].max(16) as f32)) * 255.0).clamp(0.0, 255.0);
        let mut ng = ((p[1] as f32 / (bg[1].max(16) as f32)) * 255.0).clamp(0.0, 255.0);
        let mut nb = ((p[2] as f32 / (bg[2].max(16) as f32)) * 255.0).clamp(0.0, 255.0);

        if force_bw_luma || mode == "bw_red_seal" {
            // Boost contrast to whiten paper background while keeping ink crisp
            let is_red = keep_red_seal && (nr - ng > 35.0) && (nr - nb > 35.0);
            if !is_red && force_bw_luma {
                let luma = (0.299 * nr + 0.587 * ng + 0.114 * nb).clamp(0.0, 255.0);
                let pushed = ((luma - 180.0) * 1.45 + 210.0).clamp(0.0, 255.0);
                nr = pushed;
                ng = pushed;
                nb = pushed;
            } else if mode == "bw_red_seal" && !is_red {
                let luma = (0.299 * nr + 0.587 * ng + 0.114 * nb).clamp(0.0, 255.0);
                let pushed = ((luma - 180.0) * 1.45 + 210.0).clamp(0.0, 255.0);
                nr = pushed;
                ng = pushed;
                nb = pushed;
            }
        }

        p[0] = (p[0] as f32 * (1.0 - alpha) + nr * alpha).round().clamp(0.0, 255.0) as u8;
        p[1] = (p[1] as f32 * (1.0 - alpha) + ng * alpha).round().clamp(0.0, 255.0) as u8;
        p[2] = (p[2] as f32 * (1.0 - alpha) + nb * alpha).round().clamp(0.0, 255.0) as u8;
    }
}

fn box_blur_rgb(img: &RgbImage, radius: i32) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    for y in 0..h as i32 {
        for x in 0..w as i32 {
            let mut sum = [0u32; 3];
            let mut cnt = 0u32;
            for dy in -radius..=radius {
                let py = (y + dy).clamp(0, h as i32 - 1) as u32;
                for dx in -radius..=radius {
                    let px = (x + dx).clamp(0, w as i32 - 1) as u32;
                    let p = img.get_pixel(px, py);
                    sum[0] += p[0] as u32;
                    sum[1] += p[1] as u32;
                    sum[2] += p[2] as u32;
                    cnt += 1;
                }
            }
            out.put_pixel(
                x as u32,
                y as u32,
                Rgb([(sum[0] / cnt) as u8, (sum[1] / cnt) as u8, (sum[2] / cnt) as u8]),
            );
        }
    }
    out
}

fn apply_auto_white_balance(img: &mut RgbImage) {
    let mut max_rgb = [1u8; 3];
    for p in img.pixels() {
        for c in 0..3 {
            if p[c] > max_rgb[c] { max_rgb[c] = p[c]; }
        }
    }
    let scale = [255.0 / max_rgb[0] as f32, 255.0 / max_rgb[1] as f32, 255.0 / max_rgb[2] as f32];
    for p in img.pixels_mut() {
        for c in 0..3 {
            p[c] = (p[c] as f32 * scale[c]).round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_auto_levels(img: &mut RgbImage) {
    let mut hist = [[0u32; 256]; 3];
    let total = (img.width() * img.height()).max(1);
    for p in img.pixels() {
        hist[0][p[0] as usize] += 1;
        hist[1][p[1] as usize] += 1;
        hist[2][p[2] as usize] += 1;
    }
    let clip = (total as f32 * 0.005) as u32;
    let mut lo = [0u8; 3];
    let mut hi = [255u8; 3];
    for c in 0..3 {
        let mut acc = 0u32;
        for i in 0..256 {
            acc += hist[c][i];
            if acc >= clip { lo[c] = i as u8; break; }
        }
        acc = 0;
        for i in (0..256).rev() {
            acc += hist[c][i];
            if acc >= clip { hi[c] = (i as u8).max(lo[c] + 1); break; }
        }
    }
    for p in img.pixels_mut() {
        for c in 0..3 {
            let v = (p[c] as f32 - lo[c] as f32) / (hi[c] - lo[c]) as f32 * 255.0;
            p[c] = v.round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_auto_contrast(img: &mut RgbImage) {
    let hist = compute_histogram(img);
    let total = (img.width() * img.height()).max(1);
    let clip = (total as f32 * 0.01) as u32;
    let mut lo = 0u8;
    let mut hi = 255u8;
    let mut acc = 0u32;
    for i in 0..256 {
        acc += hist[i];
        if acc >= clip { lo = i as u8; break; }
    }
    acc = 0;
    for i in (0..256).rev() {
        acc += hist[i];
        if acc >= clip { hi = (i as u8).max(lo + 1); break; }
    }
    let scale = 255.0 / (hi - lo) as f32;
    for p in img.pixels_mut() {
        for c in 0..3 {
            p[c] = ((p[c] as f32 - lo as f32) * scale).round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_auto_bleach(img: &mut RgbImage) {
    // Aggressive white-paper bleach: maps top 45% bright paper tones to pure white, darkens ink
    for p in img.pixels_mut() {
        for c in 0..3 {
            let v = p[c] as f32;
            let mapped = if v > 175.0 {
                255.0
            } else if v < 55.0 {
                v * 0.65
            } else {
                (v - 55.0) / 120.0 * 215.0 + 36.0
            };
            p[c] = mapped.round().clamp(0.0, 255.0) as u8;
        }
    }
}

fn apply_scale(img: &RgbImage, scale_percent: f32, filter_name: &str, max_cap: u32) -> RgbImage {
    let (w, h) = img.dimensions();
    let ratio = (scale_percent / 100.0).clamp(0.25, 4.0);
    let mut nw = ((w as f32) * ratio).round().max(16.0) as u32;
    let mut nh = ((h as f32) * ratio).round().max(16.0) as u32;
    if nw > max_cap || nh > max_cap {
        let s = (max_cap as f32 / nw as f32).min(max_cap as f32 / nh as f32);
        nw = ((nw as f32) * s).round().max(16.0) as u32;
        nh = ((nh as f32) * s).round().max(16.0) as u32;
    }
    let filter = match filter_name {
        "catmull_rom" => image::imageops::FilterType::CatmullRom,
        "triangle" => image::imageops::FilterType::Triangle,
        _ => image::imageops::FilterType::Lanczos3,
    };
    image::imageops::resize(img, nw, nh, filter)
}

fn apply_multi_scale_detail(img: &RgbImage, strength: f32) -> RgbImage {
    let b1 = image::imageops::blur(img, 1.0);
    let b2 = image::imageops::blur(img, 3.0);
    let k = (strength / 100.0).clamp(0.0, 1.0);
    let mut out = img.clone();
    for (x, y, p) in out.enumerate_pixels_mut() {
        let p1 = b1.get_pixel(x, y);
        let p2 = b2.get_pixel(x, y);
        for c in 0..3 {
            let d1 = p[c] as f32 - p1[c] as f32;
            let d2 = p1[c] as f32 - p2[c] as f32;
            let v = p[c] as f32 + k * (0.9 * d1 + 0.5 * d2);
            p[c] = v.round().clamp(0.0, 255.0) as u8;
        }
    }
    out
}

fn apply_tone_adjustments(img: &mut RgbImage, params: &EnhanceParams) {
    let mut lut = [0u8; 256];
    let b_lo = params.levels_black as f32;
    let b_hi = (params.levels_white as f32).max(b_lo + 1.0);
    let mid_inv = 1.0 / params.levels_mid.clamp(0.2, 4.0);
    let bright_offset = (params.brightness - 100.0) * 1.28;
    let contrast_factor = params.contrast / 100.0;
    // Per CEP convention: gamma > 100 darkens midtones/text; gamma < 100 lightens
    let gamma_exp = params.gamma.clamp(10.0, 300.0) / 100.0;
    let curve_active = (params.curve_dark_x - 0.25).abs() > 0.005
        || (params.curve_dark_y - 0.25).abs() > 0.005
        || (params.curve_light_x - 0.75).abs() > 0.005
        || (params.curve_light_y - 0.75).abs() > 0.005;

    for i in 0..256 {
        // 1. Levels (black, white, midtone gamma)
        let mut v = ((i as f32 - b_lo) / (b_hi - b_lo)).clamp(0.0, 1.0).powf(mid_inv);

        // 2. Smooth Monotone Cubic Hermite Curve through (0,0), (x1,y1), (x2,y2), (1,1)
        if curve_active {
            v = eval_smooth_curve(
                v,
                params.curve_dark_x,
                params.curve_dark_y,
                params.curve_light_x,
                params.curve_light_y,
            );
        }

        // 3. Strong background screen push (if > 0)
        if params.strong_bg_screen > 0.5 {
            let cut = 1.0 - (params.strong_bg_screen / 100.0) * 0.35;
            if v >= cut {
                v = 1.0;
            } else {
                v = (v / cut).powf(1.15);
            }
        }

        // 4. Highlight boost (only pixels >= highlight_threshold)
        let mut x = v * 255.0;
        if (params.highlight_boost - 100.0).abs() > 0.5 && x >= params.highlight_threshold as f32 {
            x = params.highlight_threshold as f32
                + (x - params.highlight_threshold as f32) * (params.highlight_boost / 100.0);
        }

        // 5. Brightness & Contrast
        x += bright_offset;
        x = (x - 128.0) * contrast_factor + 128.0;

        // 6. Shadow / Highlight (Light EQ)
        let norm_x = (x / 255.0).clamp(0.0, 1.0);
        if params.light_shadows.abs() > 0.5 {
            let shadow_w = (1.0 - norm_x).powf(2.0);
            x += shadow_w * params.light_shadows * 0.8;
        }
        if params.light_highlights.abs() > 0.5 {
            let high_w = norm_x.powf(2.0);
            x += high_w * params.light_highlights * 0.8;
        }

        // 7. Gamma
        let norm = (x / 255.0).clamp(0.0, 1.0);
        let g = norm.powf(gamma_exp) * 255.0;
        lut[i] = g.round().clamp(0.0, 255.0) as u8;
    }

    for p in img.pixels_mut() {
        p[0] = lut[p[0] as usize];
        p[1] = lut[p[1] as usize];
        p[2] = lut[p[2] as usize];

        if params.vibrance.abs() > 0.5 {
            let max_c = p[0].max(p[1]).max(p[2]) as f32;
            let min_c = p[0].min(p[1]).min(p[2]) as f32;
            let sat = (max_c - min_c) / 255.0;
            let amt = (params.vibrance / 100.0) * (1.0 - sat);
            let avg = (p[0] as f32 + p[1] as f32 + p[2] as f32) / 3.0;
            for c in 0..3 {
                p[c] = (p[c] as f32 + (p[c] as f32 - avg) * amt).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
}

/// Smooth Monotone Cubic Hermite Spline through (0,0), (x1,y1), (x2,y2), (1,1)
fn eval_smooth_curve(x: f32, x1_raw: f32, y1: f32, x2_raw: f32, y2: f32) -> f32 {
    let x1 = x1_raw.clamp(0.05, 0.48);
    let x2 = x2_raw.clamp(x1 + 0.05, 0.95);
    let xs = [0.0f32, x1, x2, 1.0];
    let ys = [0.0f32, y1.clamp(0.0, 1.0), y2.clamp(0.0, 1.0), 1.0];

    let mut d = [0.0f32; 3];
    for i in 0..3 {
        d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]).max(1e-5);
    }

    let mut m = [0.0f32; 4];
    m[0] = d[0];
    m[3] = d[2];
    for i in 1..3 {
        if d[i - 1] * d[i] <= 0.0 {
            m[i] = 0.0;
        } else {
            m[i] = 0.5 * (d[i - 1] + d[i]);
        }
    }

    let seg = if x < x1 {
        0
    } else if x < x2 {
        1
    } else {
        2
    };
    let h = (xs[seg + 1] - xs[seg]).max(1e-5);
    let t = ((x - xs[seg]) / h).clamp(0.0, 1.0);
    let t2 = t * t;
    let t3 = t2 * t;

    let h00 = 2.0 * t3 - 3.0 * t2 + 1.0;
    let h10 = t3 - 2.0 * t2 + t;
    let h01 = -2.0 * t3 + 3.0 * t2;
    let h11 = t3 - t2;

    (h00 * ys[seg] + h10 * h * m[seg] + h01 * ys[seg + 1] + h11 * h * m[seg + 1]).clamp(0.0, 1.0)
}

fn apply_morphology(img: &RgbImage, op: &str) -> RgbImage {
    match op {
        "bold" => morph_min_max(img, true),
        "thin" => morph_min_max(img, false),
        "open" => morph_min_max(&morph_min_max(img, false), true),
        "close" => morph_min_max(&morph_min_max(img, true), false),
        _ => img.clone(),
    }
}

fn morph_min_max(img: &RgbImage, is_min: bool) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    for y in 0..h as i32 {
        for x in 0..w as i32 {
            let mut best = if is_min { [255u8; 3] } else { [0u8; 3] };
            for dy in -1..=1 {
                let py = (y + dy).clamp(0, h as i32 - 1) as u32;
                for dx in -1..=1 {
                    let px = (x + dx).clamp(0, w as i32 - 1) as u32;
                    let p = img.get_pixel(px, py);
                    for c in 0..3 {
                        if is_min {
                            if p[c] < best[c] { best[c] = p[c]; }
                        } else if p[c] > best[c] {
                            best[c] = p[c];
                        }
                    }
                }
            }
            out.put_pixel(x as u32, y as u32, Rgb(best));
        }
    }
    out
}

fn apply_surface_blur(img: &RgbImage, radius: u8, threshold: u8) -> RgbImage {
    let (w, h) = img.dimensions();
    let r = radius.min(6) as i32;
    let thresh = threshold as i32;
    let mut out = RgbImage::new(w, h);

    for y in 0..h as i32 {
        for x in 0..w as i32 {
            let center = img.get_pixel(x as u32, y as u32);
            let mut sum = [0i32; 3];
            let mut wsum = [0i32; 3];

            for dy in -r..=r {
                let py = (y + dy).clamp(0, h as i32 - 1) as u32;
                for dx in -r..=r {
                    let px = (x + dx).clamp(0, w as i32 - 1) as u32;
                    let p = img.get_pixel(px, py);
                    for c in 0..3 {
                        let diff = (p[c] as i32 - center[c] as i32).abs();
                        if diff < thresh {
                            let weight = thresh - diff;
                            sum[c] += p[c] as i32 * weight;
                            wsum[c] += weight;
                        }
                    }
                }
            }
            let mut res = [0u8; 3];
            for c in 0..3 {
                res[c] = if wsum[c] > 0 { (sum[c] / wsum[c]) as u8 } else { center[c] };
            }
            out.put_pixel(x as u32, y as u32, Rgb(res));
        }
    }
    out
}

fn apply_usm_sharpen(img: &RgbImage, amount: f32, radius: f32, threshold: u8) -> RgbImage {
    let blurred = image::imageops::blur(img, radius.clamp(0.5, 5.0));
    let factor = amount / 100.0;
    let thresh = threshold as i32;
    let mut out = img.clone();

    for (x, y, p) in out.enumerate_pixels_mut() {
        let b = blurred.get_pixel(x, y);
        for c in 0..3 {
            let diff = p[c] as i32 - b[c] as i32;
            if diff.abs() >= thresh {
                p[c] = (p[c] as f32 + diff as f32 * factor).round().clamp(0.0, 255.0) as u8;
            }
        }
    }
    out
}

fn apply_color_depth_and_binarize(img: &RgbImage, params: &EnhanceParams) -> RgbImage {
    let mut mode = params.color_depth.as_str();
    if mode == "keep" && params.mixed_book_auto_bw {
        // Heuristic: if low saturation across sample pixels, treat as B&W text page
        let mut colorful = 0u32;
        let mut total = 0u32;
        for (i, p) in img.pixels().enumerate() {
            if i % 16 == 0 {
                total += 1;
                let max_c = p[0].max(p[1]).max(p[2]);
                let min_c = p[0].min(p[1]).min(p[2]);
                if max_c - min_c > 28 { colorful += 1; }
            }
        }
        if (colorful as f32 / total.max(1) as f32) < 0.03 {
            mode = "bw";
        }
    }

    match mode {
        "gray256" => to_gray_levels(img, 256, params.dither),
        "gray16" => to_gray_levels(img, 16, params.dither),
        "gray8" => to_gray_levels(img, 8, params.dither),
        "gray4" => to_gray_levels(img, 4, params.dither),
        "bw" => {
            // Scale Wolf window proportionally to actual image width so thick headings don't turn hollow at 200%-300%
            let base_win = params.wolf_window.max(7) as f32;
            let res_factor = (img.width() as f32 / 1400.0).clamp(0.8, 3.0);
            let effective_win = (base_win * res_factor).round() as u32;
            let mut bin = match params.binarize_method.as_str() {
                "wolf" => binarize_wolf(img, effective_win),
                "otsu" => binarize_otsu(img),
                _ => binarize_fixed(img, 128),
            };
            if params.despeckle_size > 0 {
                despeckle_bw(&mut bin, params.despeckle_size);
            }
            if params.remove_lines_enabled {
                remove_bw_components(&mut bin, params.remove_line_max_w, params.remove_line_max_h);
            }
            if params.remove_edge_black {
                clear_edge_black(&mut bin);
            }
            if params.deburr {
                deburr_bw(&mut bin);
            }
            bin
        }
        _ => img.clone(),
    }
}

fn to_gray_levels(img: &RgbImage, levels: u32, dither: bool) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut buf: Vec<f32> = img
        .pixels()
        .map(|p| 0.299 * p[0] as f32 + 0.587 * p[1] as f32 + 0.114 * p[2] as f32)
        .collect();
    let step = 255.0 / (levels - 1).max(1) as f32;
    let mut out = RgbImage::new(w, h);

    for y in 0..h as usize {
        for x in 0..w as usize {
            let idx = y * w as usize + x;
            let old = buf[idx].clamp(0.0, 255.0);
            let q = ((old / step).round() * step).clamp(0.0, 255.0);
            let q8 = q as u8;
            out.put_pixel(x as u32, y as u32, Rgb([q8, q8, q8]));

            if dither {
                let err = old - q;
                if x + 1 < w as usize { buf[idx + 1] += err * 7.0 / 16.0; }
                if y + 1 < h as usize {
                    if x > 0 { buf[idx + w as usize - 1] += err * 3.0 / 16.0; }
                    buf[idx + w as usize] += err * 5.0 / 16.0;
                    if x + 1 < w as usize { buf[idx + w as usize + 1] += err * 1.0 / 16.0; }
                }
            }
        }
    }
    out
}

fn binarize_fixed(img: &RgbImage, thresh: u8) -> RgbImage {
    let (w, h) = img.dimensions();
    let mut out = RgbImage::new(w, h);
    for (x, y, p) in img.enumerate_pixels() {
        let luma = ((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8;
        let v = if luma >= thresh { 255 } else { 0 };
        out.put_pixel(x, y, Rgb([v, v, v]));
    }
    out
}

fn binarize_otsu(img: &RgbImage) -> RgbImage {
    let hist = compute_histogram(img);
    let total = (img.width() * img.height()) as f64;
    let mut sum_all = 0.0f64;
    for (i, &c) in hist.iter().enumerate() {
        sum_all += (i as f64) * (c as f64);
    }
    let mut sum_b = 0.0f64;
    let mut w_b = 0.0f64;
    let mut max_var = -1.0f64;
    let mut best_t = 128u8;

    for (t, &c) in hist.iter().enumerate() {
        w_b += c as f64;
        if w_b == 0.0 { continue; }
        let w_f = total - w_b;
        if w_f == 0.0 { break; }
        sum_b += (t as f64) * (c as f64);
        let m_b = sum_b / w_b;
        let m_f = (sum_all - sum_b) / w_f;
        let var = w_b * w_f * (m_b - m_f) * (m_b - m_f);
        if var > max_var {
            max_var = var;
            best_t = t as u8;
        }
    }
    binarize_fixed(img, best_t)
}

/// Fast O(1)-per-pixel Wolf Local Adaptive Thresholding using Integral Images
fn binarize_wolf(img: &RgbImage, win: u32) -> RgbImage {
    let (w, h) = img.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    let r = (win / 2).max(3) as isize;

    let mut gray = vec![0u8; wu * hu];
    let mut min_g = 255.0f64;
    for (i, p) in img.pixels().enumerate() {
        let g = ((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8;
        gray[i] = g;
        if (g as f64) < min_g { min_g = g as f64; }
    }

    // Integral image & squared integral image (stride wu + 1)
    let sw = wu + 1;
    let mut integ = vec![0.0f64; sw * (hu + 1)];
    let mut integ_sq = vec![0.0f64; sw * (hu + 1)];

    for y in 1..=hu {
        let mut row_s = 0.0f64;
        let mut row_sq = 0.0f64;
        for x in 1..=wu {
            let v = gray[(y - 1) * wu + (x - 1)] as f64;
            row_s += v;
            row_sq += v * v;
            integ[y * sw + x] = integ[(y - 1) * sw + x] + row_s;
            integ_sq[y * sw + x] = integ_sq[(y - 1) * sw + x] + row_sq;
        }
    }

    let mut means = vec![0.0f64; wu * hu];
    let mut stds = vec![0.0f64; wu * hu];
    let mut max_std = 1.0f64;

    for y in 0..hu {
        let y0 = (y as isize - r).max(0) as usize;
        let y1 = (y as isize + r).min(hu as isize - 1) as usize + 1;
        for x in 0..wu {
            let x0 = (x as isize - r).max(0) as usize;
            let x1 = (x as isize + r).min(wu as isize - 1) as usize + 1;
            let area = ((x1 - x0) * (y1 - y0)) as f64;
            let s = integ[y1 * sw + x1] - integ[y0 * sw + x1] - integ[y1 * sw + x0] + integ[y0 * sw + x0];
            let sq = integ_sq[y1 * sw + x1] - integ_sq[y0 * sw + x1] - integ_sq[y1 * sw + x0] + integ_sq[y0 * sw + x0];
            let mean = s / area;
            let var = (sq / area - mean * mean).max(0.0);
            let sd = var.sqrt();
            let idx = y * wu + x;
            means[idx] = mean;
            stds[idx] = sd;
            if sd > max_std { max_std = sd; }
        }
    }

    // Clamp max_std so dark table/border edges don't crush Wolf threshold on faint text
    let safe_max_std = max_std.clamp(25.0, 80.0);
    let k = 0.26f64;
    let mut out = RgbImage::new(w, h);
    for y in 0..hu {
        for x in 0..wu {
            let idx = y * wu + x;
            let m = means[idx];
            let s = stds[idx].min(safe_max_std);
            let thresh = (1.0 - k) * m + k * min_g + k * (s / safe_max_std) * (m - min_g);
            let v = if (gray[idx] as f64) >= thresh { 255 } else { 0 };
            out.put_pixel(x as u32, y as u32, Rgb([v, v, v]));
        }
    }
    out
}

fn despeckle_bw(img: &mut RgbImage, max_diam: u32) {
    let (w, h) = img.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    let mut visited = vec![false; wu * hu];
    let max_area = (max_diam * max_diam) as usize;

    for sy in 0..hu {
        for sx in 0..wu {
            let sidx = sy * wu + sx;
            if visited[sidx] || img.get_pixel(sx as u32, sy as u32)[0] > 128 {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            let mut comp = Vec::new();
            visited[sidx] = true;
            let mut min_x = sx;
            let mut max_x = sx;
            let mut min_y = sy;
            let mut max_y = sy;

            while let Some((cx, cy)) = stack.pop() {
                comp.push((cx, cy));
                min_x = min_x.min(cx);
                max_x = max_x.max(cx);
                min_y = min_y.min(cy);
                max_y = max_y.max(cy);

                for (nx, ny) in [
                    (cx.wrapping_sub(1), cy),
                    (cx + 1, cy),
                    (cx, cy.wrapping_sub(1)),
                    (cx, cy + 1),
                ] {
                    if nx < wu && ny < hu {
                        let nidx = ny * wu + nx;
                        if !visited[nidx] && img.get_pixel(nx as u32, ny as u32)[0] <= 128 {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }

            let bw_w = (max_x - min_x + 1) as u32;
            let bw_h = (max_y - min_y + 1) as u32;
            if comp.len() <= max_area && bw_w <= max_diam && bw_h <= max_diam {
                for (px, py) in comp {
                    img.put_pixel(px as u32, py as u32, Rgb([255, 255, 255]));
                }
            }
        }
    }
}

fn remove_margin_fingers_fn(img: &mut RgbImage) {
    let (w, h) = img.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    if wu < 20 || hu < 20 {
        return;
    }
    let margin_x = (wu * 22) / 100; // outer 22% left & right margins
    let rad = ((wu as f32 / 1200.0) * 24.0).round().clamp(10.0, 48.0) as isize;
    let mut left_reach = vec![0isize; hu];
    let mut right_reach = vec![wu as isize; hu];

    for y in 0..hu {
        for x in 0..margin_x {
            let p = img.get_pixel(x as u32, y as u32);
            let (r, g, b) = (p[0] as i32, p[1] as i32, p[2] as i32);
            if r > 80 && g > 30 && b > 15 && r > g + 7 && r > b + 16 {
                left_reach[y] = (x as isize + rad).min(margin_x as isize);
            }
        }
        for x in (wu - margin_x..wu).rev() {
            let p = img.get_pixel(x as u32, y as u32);
            let (r, g, b) = (p[0] as i32, p[1] as i32, p[2] as i32);
            if r > 80 && g > 30 && b > 15 && r > g + 7 && r > b + 16 {
                right_reach[y] = (x as isize - rad).max((wu - margin_x) as isize);
            }
        }
    }

    // Smooth vertically by rad so fingernail/shadow above & below skin are also cleared
    let mut left_dil = left_reach.clone();
    let mut right_dil = right_reach.clone();
    for y in 0..hu as isize {
        let y0 = (y - rad).max(0) as usize;
        let y1 = (y + rad).min(hu as isize - 1) as usize;
        let mut max_l = 0isize;
        let mut min_r = wu as isize;
        for ny in y0..=y1 {
            if left_reach[ny] > max_l { max_l = left_reach[ny]; }
            if right_reach[ny] < min_r { min_r = right_reach[ny]; }
        }
        left_dil[y as usize] = max_l;
        right_dil[y as usize] = min_r;
    }

    for y in 0..hu {
        let lx = left_dil[y].clamp(0, wu as isize) as usize;
        for x in 0..lx {
            img.put_pixel(x as u32, y as u32, Rgb([255, 255, 255]));
        }
        let rx = right_dil[y].clamp(0, wu as isize) as usize;
        for x in rx..wu {
            img.put_pixel(x as u32, y as u32, Rgb([255, 255, 255]));
        }
    }
}

/// True 4-edge BFS flood-fill removal: deletes any black component touching the outer 6px page borders.
fn clear_edge_black(img: &mut RgbImage) {
    let (w, h) = img.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    if wu < 12 || hu < 12 {
        return;
    }
    let mut visited = vec![false; wu * hu];
    let mut stack = Vec::new();
    let seed_d = 6usize;

    // Seed all dark pixels within 6px of the 4 outer borders
    for x in 0..wu {
        for y in (0..seed_d).chain((hu - seed_d)..hu) {
            let idx = y * wu + x;
            if !visited[idx] && img.get_pixel(x as u32, y as u32)[0] < 128 {
                visited[idx] = true;
                stack.push((x, y));
            }
        }
    }
    for y in 0..hu {
        for x in (0..seed_d).chain((wu - seed_d)..wu) {
            let idx = y * wu + x;
            if !visited[idx] && img.get_pixel(x as u32, y as u32)[0] < 128 {
                visited[idx] = true;
                stack.push((x, y));
            }
        }
    }

    while let Some((cx, cy)) = stack.pop() {
        img.put_pixel(cx as u32, cy as u32, Rgb([255, 255, 255]));
        for (nx, ny) in [
            (cx.wrapping_sub(1), cy),
            (cx + 1, cy),
            (cx, cy.wrapping_sub(1)),
            (cx, cy + 1),
        ] {
            if nx < wu && ny < hu {
                let nidx = ny * wu + nx;
                if !visited[nidx] && img.get_pixel(nx as u32, ny as u32)[0] < 128 {
                    visited[nidx] = true;
                    stack.push((nx, ny));
                }
            }
        }
    }

    // Also remove large curved finger/nail arcs isolated inside the outer 15% left/right margin
    let left_m = (wu * 15) / 100;
    let right_m = (wu * 85) / 100;
    let min_arc_h = (wu / 28).max(28);
    for sy in 0..hu {
        for sx in (0..left_m).chain(right_m..wu) {
            let sidx = sy * wu + sx;
            if visited[sidx] || img.get_pixel(sx as u32, sy as u32)[0] >= 128 {
                continue;
            }
            let mut comp = Vec::new();
            stack.push((sx, sy));
            visited[sidx] = true;
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            while let Some((cx, cy)) = stack.pop() {
                comp.push((cx, cy));
                if cx < min_x { min_x = cx; }
                if cx > max_x { max_x = cx; }
                if cy < min_y { min_y = cy; }
                if cy > max_y { max_y = cy; }
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < wu && ny < hu {
                        let nidx = ny * wu + nx;
                        if !visited[nidx] && img.get_pixel(nx as u32, ny as u32)[0] < 128 {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            let bh = max_y - min_y + 1;
            let in_margin = max_x < left_m || min_x > right_m;
            if in_margin && bh >= min_arc_h {
                for (px, py) in comp {
                    img.put_pixel(px as u32, py as u32, Rgb([255, 255, 255]));
                }
            }
        }
    }
}

/// Multi-grid per-line baseline straightening (Leptonica-style):
/// 1. Horizontal run-length smearing (RLSA) merges characters & split radicals into text-line ribbons.
/// 2. Extracts vertical ink centroid profile per line across 48 horizontal slices.
/// 3. Fits a smooth cubic polynomial y(x) per line using IRLS (Huber weights) to ignore punctuation/outliers.
/// 4. Builds a 32x48 displacement grid via column-wise piecewise linear vertical interpolation (100% correction at top/bottom lines).
/// 5. Resamples with Catmull-Rom bicubic interpolation for crisp text edges.
fn compute_line_grid_dewarp(img: &RgbImage) -> Option<Vec<f32>> {
    let (w, h) = img.dimensions();
    if w < 100 || h < 100 {
        return None;
    }
    let scale = (960.0 / w.max(h) as f32).min(1.0);
    let sw = ((w as f32 * scale).round() as u32).max(60);
    let sh = ((h as f32 * scale).round() as u32).max(60);
    let small = image::imageops::resize(img, sw, sh, image::imageops::FilterType::Triangle);

    let swu = sw as usize;
    let shu = sh as usize;
    let mut ink = vec![false; swu * shu];
    for sy in 0..shu {
        for sx in 0..swu {
            let p = small.get_pixel(sx as u32, sy as u32);
            let luma = (p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8;
            ink[sy * swu + sx] = luma < 170;
        }
    }

    // 1. Horizontal Run-Length Smoothing (RLSA) to bridge inter-character gaps & split radicals
    let gap = (swu / 52).clamp(8, 22);
    let mut smeared = ink.clone();
    for sy in 0..shu {
        let row = sy * swu;
        let mut last_ink: Option<usize> = None;
        for sx in 0..swu {
            if ink[row + sx] {
                if let Some(px) = last_ink {
                    if sx - px <= gap {
                        for fill in (px + 1)..sx {
                            smeared[row + fill] = true;
                        }
                    }
                }
                last_ink = Some(sx);
            }
        }
    }

    // 2. Connected components on smeared mask -> text-line ribbons
    struct FittedLine {
        x_min: f32,
        x_max: f32,
        y_target: f32,
        coeffs: [f32; 4], // cubic in u = x - 0.5
    }

    let min_line_w = (swu / 10).max(40);
    let min_line_h = (shu / 180).max(5);
    let max_line_h = (shu / 18).max(32);

    let mut visited = vec![false; swu * shu];
    let mut lines: Vec<FittedLine> = Vec::new();
    const SLICES: usize = 48;

    for sy in 0..shu {
        for sx in 0..swu {
            let sidx = sy * swu + sx;
            if visited[sidx] || !smeared[sidx] {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            visited[sidx] = true;
            let mut pixels: Vec<(usize, usize)> = Vec::new();
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            while let Some((cx, cy)) = stack.pop() {
                if ink[cy * swu + cx] {
                    pixels.push((cx, cy));
                }
                if cx < min_x { min_x = cx; }
                if cx > max_x { max_x = cx; }
                if cy < min_y { min_y = cy; }
                if cy > max_y { max_y = cy; }
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < swu && ny < shu {
                        let nidx = ny * swu + nx;
                        if !visited[nidx] && smeared[nidx] {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            let bw = max_x - min_x + 1;
            let bh = max_y - min_y + 1;
            if bw < min_line_w || bh < min_line_h || bh > max_line_h || pixels.len() < 24 {
                continue;
            }

            // Bin original ink pixels into horizontal slices & compute vertical centroid per slice
            let mut sum_x = [0.0f32; SLICES];
            let mut sum_y = [0.0f32; SLICES];
            let mut cnt_b = [0u32; SLICES];
            let span_x = (bw as f32).max(1.0);
            for &(px, py) in &pixels {
                let b = (((px - min_x) as f32 / span_x) * (SLICES as f32)).floor() as usize;
                let b = b.min(SLICES - 1);
                sum_x[b] += px as f32;
                sum_y[b] += py as f32;
                cnt_b[b] += 1;
            }

            let mut pts: Vec<(f32, f32)> = Vec::new();
            for b in 0..SLICES {
                if cnt_b[b] >= 3 {
                    let nx = (sum_x[b] / cnt_b[b] as f32) / swu as f32;
                    let ny = (sum_y[b] / cnt_b[b] as f32) / shu as f32;
                    pts.push((nx, ny));
                }
            }
            if pts.len() < 8 {
                continue;
            }

            // 3. Fit cubic polynomial y(u) = c0 + c1*u + c2*u^2 + c3*u^3 via 3-step IRLS (Huber)
            if let Some(coeffs) = fit_cubic_irls(&pts) {
                let x_min = min_x as f32 / swu as f32;
                let x_max = max_x as f32 / swu as f32;
                let mut y_vals: Vec<f32> = pts
                    .iter()
                    .map(|&(px, _)| eval_cubic(&coeffs, px - 0.5))
                    .collect();
                y_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let y_target = y_vals[y_vals.len() / 2];
                lines.push(FittedLine {
                    x_min,
                    x_max,
                    y_target,
                    coeffs,
                });
            }
        }
    }

    if lines.len() < 3 {
        return None;
    }

    // 4. Build 32x48 displacement grid via column-wise piecewise linear vertical interpolation
    const GW: usize = 32;
    const GH: usize = 48;
    let mut grid_dy = vec![0.0f32; GW * GH];

    for gx in 0..GW {
        let nx = gx as f32 / (GW - 1) as f32;
        let mut col_pts: Vec<(f32, f32)> = Vec::new();
        for l in &lines {
            // Use lines covering this X column (with 8% margin)
            if nx >= l.x_min - 0.08 && nx <= l.x_max + 0.08 {
                let cx = nx.clamp(l.x_min - 0.03, l.x_max + 0.03);
                let dy = (eval_cubic(&l.coeffs, cx - 0.5) - l.y_target).clamp(-0.06, 0.06);
                col_pts.push((l.y_target, dy));
            }
        }
        // Fallback if very few lines cover this margin column: use nearest lines clamped to their span
        if col_pts.len() < 2 {
            col_pts.clear();
            for l in &lines {
                let cx = nx.clamp(l.x_min, l.x_max);
                let dy = (eval_cubic(&l.coeffs, cx - 0.5) - l.y_target).clamp(-0.06, 0.06);
                col_pts.push((l.y_target, dy));
            }
        }
        col_pts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));

        for gy in 0..GH {
            let ny = gy as f32 / (GH - 1) as f32;
            let dy = if col_pts.is_empty() {
                0.0
            } else if ny <= col_pts[0].0 {
                col_pts[0].1
            } else if ny >= col_pts[col_pts.len() - 1].0 {
                col_pts[col_pts.len() - 1].1
            } else {
                let mut val = col_pts[0].1;
                for k in 0..(col_pts.len() - 1) {
                    let (y0, d0) = col_pts[k];
                    let (y1, d1) = col_pts[k + 1];
                    if ny >= y0 && ny <= y1 {
                        let t = if (y1 - y0).abs() > 1e-6 { (ny - y0) / (y1 - y0) } else { 0.0 };
                        val = d0 + t * (d1 - d0);
                        break;
                    }
                }
                val
            };
            grid_dy[gy * GW + gx] = dy;
        }
    }

    // Light horizontal smoothing pass [0.2, 0.6, 0.2] to keep column transitions C1-smooth
    let mut smoothed_grid = grid_dy.clone();
    for gy in 0..GH {
        for gx in 1..(GW - 1) {
            smoothed_grid[gy * GW + gx] = 0.2 * grid_dy[gy * GW + gx - 1]
                + 0.6 * grid_dy[gy * GW + gx]
                + 0.2 * grid_dy[gy * GW + gx + 1];
        }
    }

    Some(smoothed_grid)
}

fn warp_with_line_grid(img: &RgbImage, smoothed_grid: &[f32]) -> RgbImage {
    const GW: usize = 32;
    const GH: usize = 48;
    let (w, h) = img.dimensions();
    if w < 100 || h < 100 || smoothed_grid.len() != GW * GH {
        return img.clone();
    }

    // 5. Warp image using Catmull-Rom bicubic interpolation for sharp text
    let mut out = RgbImage::new(w, h);
    let wf = (w.saturating_sub(1)).max(1) as f32;
    let hf = (h.saturating_sub(1)).max(1) as f32;

    for y in 0..h {
        let ny = y as f32 / hf;
        let gy_f = ny * (GH - 1) as f32;
        let gy0 = (gy_f.floor() as usize).min(GH - 1);
        let gy1 = (gy0 + 1).min(GH - 1);
        let fy = gy_f - gy0 as f32;

        for x in 0..w {
            let nx = x as f32 / wf;
            let gx_f = nx * (GW - 1) as f32;
            let gx0 = (gx_f.floor() as usize).min(GW - 1);
            let gx1 = (gx0 + 1).min(GW - 1);
            let fx = gx_f - gx0 as f32;

            let d00 = smoothed_grid[gy0 * GW + gx0];
            let d10 = smoothed_grid[gy0 * GW + gx1];
            let d01 = smoothed_grid[gy1 * GW + gx0];
            let d11 = smoothed_grid[gy1 * GW + gx1];
            let dy = (1.0 - fx) * (1.0 - fy) * d00
                + fx * (1.0 - fy) * d10
                + (1.0 - fx) * fy * d01
                + fx * fy * d11;

            let sy = (ny + dy) * hf;
            out.put_pixel(x, y, sample_bicubic_y(img, x, sy));
        }
    }
    out
}

/// Detects true illustrations on geometrically-aligned `base_img` + `pre_bw`,
/// filtering out normal body text lines (via RLSA line-height statistics) and optionally
/// filtering header/footer ornaments & small decorative icons.
fn detect_illustrations(
    base_img: &RgbImage,
    pre_bw: &RgbImage,
    filter_small_ornaments: bool,
) -> Vec<IllustrationPatch> {
    let (w, h) = base_img.dimensions();
    if w < 120 || h < 120 || pre_bw.dimensions() != (w, h) {
        return Vec::new();
    }

    let scale = (960.0 / w.max(h) as f32).min(1.0);
    let sw = ((w as f32 * scale).round() as u32).max(80);
    let sh = ((h as f32 * scale).round() as u32).max(80);
    let small_base = image::imageops::resize(base_img, sw, sh, image::imageops::FilterType::Triangle);
    let small_pre = image::imageops::resize(pre_bw, sw, sh, image::imageops::FilterType::Triangle);

    let swu = sw as usize;
    let shu = sh as usize;
    let mut ink = vec![false; swu * shu];
    let mut visual = vec![false; swu * shu];

    for y in 0..shu {
        for x in 0..swu {
            let pb = small_base.get_pixel(x as u32, y as u32);
            let luma_b = (pb[0] as u16 * 77 + pb[1] as u16 * 150 + pb[2] as u16 * 29) >> 8;
            let is_ink = luma_b < 175;
            ink[y * swu + x] = is_ink;

            let pp = small_pre.get_pixel(x as u32, y as u32);
            let max_c = pp[0].max(pp[1]).max(pp[2]);
            let min_c = pp[0].min(pp[1]).min(pp[2]);
            let luma_p = (pp[0] as u16 * 77 + pp[1] as u16 * 150 + pp[2] as u16 * 29) >> 8;
            let has_color = (max_c - min_c) > 22;
            let has_midtone = luma_p >= 35 && luma_p <= 205;
            visual[y * swu + x] = is_ink || has_color || has_midtone;
        }
    }

    // 1. Identify regular body text lines via horizontal RLSA
    let gap = (swu / 52).clamp(8, 22);
    let mut smeared = ink.clone();
    for sy in 0..shu {
        let row = sy * swu;
        let mut last_ink: Option<usize> = None;
        for sx in 0..swu {
            if ink[row + sx] {
                if let Some(px) = last_ink {
                    if sx - px <= gap {
                        for fill in (px + 1)..sx {
                            smeared[row + fill] = true;
                        }
                    }
                }
                last_ink = Some(sx);
            }
        }
    }

    let mut visited = vec![false; swu * shu];
    let mut line_heights: Vec<usize> = Vec::new();
    struct CompInfo {
        min_x: usize,
        max_x: usize,
        min_y: usize,
        max_y: usize,
        pixels: Vec<(usize, usize)>,
    }
    let mut text_comps: Vec<CompInfo> = Vec::new();

    for sy in 0..shu {
        for sx in 0..swu {
            let sidx = sy * swu + sx;
            if visited[sidx] || !smeared[sidx] {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            visited[sidx] = true;
            let mut pixels = Vec::new();
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            while let Some((cx, cy)) = stack.pop() {
                pixels.push((cx, cy));
                min_x = min_x.min(cx);
                max_x = max_x.max(cx);
                min_y = min_y.min(cy);
                max_y = max_y.max(cy);
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < swu && ny < shu {
                        let nidx = ny * swu + nx;
                        if !visited[nidx] && smeared[nidx] {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            let bw = max_x - min_x + 1;
            let bh = max_y - min_y + 1;
            if bw >= swu / 12 && bh >= 5 && bh <= shu / 20 {
                line_heights.push(bh);
            }
            text_comps.push(CompInfo { min_x, max_x, min_y, max_y, pixels });
        }
    }

    line_heights.sort_unstable();
    let med_line_h = if line_heights.is_empty() {
        (shu / 45).max(10)
    } else {
        line_heights[line_heights.len() / 2]
    };

    // Mask out regular text lines from the visual candidate map
    for c in text_comps {
        let bw = c.max_x - c.min_x + 1;
        let bh = c.max_y - c.min_y + 1;
        if bh <= (med_line_h * 18) / 10 && bh <= shu / 22 && bw >= swu / 16 {
            // Check if this strip has significant color (if colorful, keep it as possible caption/art)
            let mut color_cnt = 0usize;
            for &(px, py) in &c.pixels {
                let pp = small_pre.get_pixel(px as u32, py as u32);
                if pp[0].max(pp[1]).max(pp[2]) - pp[0].min(pp[1]).min(pp[2]) > 26 {
                    color_cnt += 1;
                }
            }
            if color_cnt * 10 < c.pixels.len() {
                for (px, py) in c.pixels {
                    visual[py * swu + px] = false;
                }
            }
        }
    }

    // 2. Dilate remaining visual regions slightly to merge nearby illustration parts
    let dil_r = (swu / 90).clamp(4, 9) as i32;
    let mut closed = vec![false; swu * shu];
    for y in 0..shu as i32 {
        for x in 0..swu as i32 {
            if !visual[y as usize * swu + x as usize] {
                continue;
            }
            let y0 = (y - dil_r).max(0) as usize;
            let y1 = (y + dil_r).min(shu as i32 - 1) as usize;
            let x0 = (x - dil_r).max(0) as usize;
            let x1 = (x + dil_r).min(swu as i32 - 1) as usize;
            for yy in y0..=y1 {
                let r_off = yy * swu;
                for xx in x0..=x1 {
                    closed[r_off + xx] = true;
                }
            }
        }
    }

    // 3. Extract & score candidate illustration bounding boxes
    visited.fill(false);
    let mut boxes: Vec<(usize, usize, usize, usize)> = Vec::new();
    let min_w = (swu / 10).max(36);
    let min_h = (med_line_h * 25 / 10).max(shu / 16).max(32);

    for sy in 0..shu {
        for sx in 0..swu {
            let sidx = sy * swu + sx;
            if visited[sidx] || !closed[sidx] {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            visited[sidx] = true;
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            while let Some((cx, cy)) = stack.pop() {
                min_x = min_x.min(cx);
                max_x = max_x.max(cx);
                min_y = min_y.min(cy);
                max_y = max_y.max(cy);
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < swu && ny < shu {
                        let nidx = ny * swu + nx;
                        if !visited[nidx] && closed[nidx] {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }

            let bw = max_x - min_x + 1;
            let bh = max_y - min_y + 1;
            if bw < min_w || bh < min_h {
                continue;
            }
            // Reject thin page borders or full-width horizontal/vertical rules
            if (bw > (swu * 85) / 100 && bh < 22) || (bh > (shu * 85) / 100 && bw < 22) {
                continue;
            }
            if filter_small_ornaments {
                let area = bw * bh;
                let page_area = swu * shu;
                if area * 1000 < page_area * 15 {
                    continue; // < 1.5% of page area
                }
                let in_top_margin = max_y < (shu * 9) / 100 && bh < (shu * 8) / 100;
                let in_bot_margin = min_y > (shu * 91) / 100 && bh < (shu * 8) / 100;
                if in_top_margin || in_bot_margin {
                    continue;
                }
            }

            // Score color / midtone / ink density inside the box on small_pre
            let mut color_px = 0usize;
            let mut midtone_px = 0usize;
            let mut dark_px = 0usize;
            let total_px = (bw * bh).max(1);
            for yy in min_y..=max_y {
                for xx in min_x..=max_x {
                    let pp = small_pre.get_pixel(xx as u32, yy as u32);
                    let max_c = pp[0].max(pp[1]).max(pp[2]);
                    let min_c = pp[0].min(pp[1]).min(pp[2]);
                    let luma = (pp[0] as u16 * 77 + pp[1] as u16 * 150 + pp[2] as u16 * 29) >> 8;
                    if (max_c - min_c) > 24 {
                        color_px += 1;
                    }
                    if luma >= 40 && luma <= 205 {
                        midtone_px += 1;
                    }
                    if luma < 175 {
                        dark_px += 1;
                    }
                }
            }
            let color_ratio = color_px as f32 / total_px as f32;
            let mid_ratio = midtone_px as f32 / total_px as f32;
            let dark_ratio = dark_px as f32 / total_px as f32;

            let is_illust = color_ratio > 0.035
                || (mid_ratio > 0.12 && bh > med_line_h * 2)
                || (bh > med_line_h * 3 && bw > (swu * 14) / 100 && dark_ratio > 0.04);

            if is_illust {
                boxes.push((min_x, min_y, max_x, max_y));
            }
        }
    }

    // 4. Merge overlapping or very close boxes
    let merge_pad = 6usize;
    loop {
        let mut merged = false;
        'outer: for i in 0..boxes.len() {
            for j in (i + 1)..boxes.len() {
                let a = boxes[i];
                let b = boxes[j];
                let overlap_x = a.0 <= b.2 + merge_pad && b.0 <= a.2 + merge_pad;
                let overlap_y = a.1 <= b.3 + merge_pad && b.1 <= a.3 + merge_pad;
                if overlap_x && overlap_y {
                    boxes[i] = (a.0.min(b.0), a.1.min(b.1), a.2.max(b.2), a.3.max(b.3));
                    boxes.remove(j);
                    merged = true;
                    break 'outer;
                }
            }
        }
        if !merged {
            break;
        }
    }

    // 5. Map boxes back to full-res coordinates & crop from pre_bw
    let sx_ratio = w as f32 / sw as f32;
    let sy_ratio = h as f32 / sh as f32;
    let pad_full = 4u32;
    let mut patches = Vec::with_capacity(boxes.len());

    for (x0, y0, x1, y1) in boxes {
        let fx0 = ((x0 as f32 * sx_ratio).floor() as u32).saturating_sub(pad_full);
        let fy0 = ((y0 as f32 * sy_ratio).floor() as u32).saturating_sub(pad_full);
        let fx1 = (((x1 + 1) as f32 * sx_ratio).ceil() as u32 + pad_full).min(w);
        let fy1 = (((y1 + 1) as f32 * sy_ratio).ceil() as u32 + pad_full).min(h);
        let pw = fx1.saturating_sub(fx0);
        let ph = fy1.saturating_sub(fy0);
        if pw < 20 || ph < 20 {
            continue;
        }
        let crop = image::imageops::crop_imm(pre_bw, fx0, fy0, pw, ph).to_image();
        patches.push(IllustrationPatch {
            x: fx0,
            y: fy0,
            img: crop,
        });
    }

    patches
}

#[inline]
fn eval_cubic(c: &[f32; 4], u: f32) -> f32 {
    c[0] + u * (c[1] + u * (c[2] + u * c[3]))
}

fn fit_cubic_irls(pts: &[(f32, f32)]) -> Option<[f32; 4]> {
    let mut weights = vec![1.0f64; pts.len()];
    let mut coeffs = [0.0f32; 4];
    for iter in 0..3 {
        let mut ata = [[0.0f64; 4]; 4];
        let mut atb = [0.0f64; 4];
        for (idx, &(px, py)) in pts.iter().enumerate() {
            let u = (px - 0.5) as f64;
            let y = py as f64;
            let w = weights[idx];
            let basis = [1.0, u, u * u, u * u * u];
            for r in 0..4 {
                atb[r] += w * basis[r] * y;
                for c in 0..4 {
                    ata[r][c] += w * basis[r] * basis[c];
                }
            }
        }
        // Small Tikhonov regularization on quadratic/cubic terms to prevent edge blowup on short lines
        ata[2][2] += 1e-4;
        ata[3][3] += 5e-4;

        let sol = solve_4x4(ata, atb)?;
        coeffs = [sol[0] as f32, sol[1] as f32, sol[2] as f32, sol[3] as f32];
        if iter < 2 {
            let delta = 0.004f64;
            for (idx, &(px, py)) in pts.iter().enumerate() {
                let r = (py - eval_cubic(&coeffs, px - 0.5)).abs() as f64;
                weights[idx] = if r <= delta { 1.0 } else { delta / r };
            }
        }
    }
    Some(coeffs)
}

fn solve_4x4(mut a: [[f64; 4]; 4], mut b: [f64; 4]) -> Option<[f64; 4]> {
    for col in 0..4 {
        let mut pivot = col;
        let mut max_val = a[col][col].abs();
        for row in (col + 1)..4 {
            if a[row][col].abs() > max_val {
                max_val = a[row][col].abs();
                pivot = row;
            }
        }
        if max_val < 1e-12 {
            return None;
        }
        if pivot != col {
            a.swap(col, pivot);
            b.swap(col, pivot);
        }
        let diag = a[col][col];
        for row in (col + 1)..4 {
            let factor = a[row][col] / diag;
            b[row] -= factor * b[col];
            for c in col..4 {
                a[row][c] -= factor * a[col][c];
            }
        }
    }
    let mut x = [0.0f64; 4];
    for row in (0..4).rev() {
        let mut sum = b[row];
        for c in (row + 1)..4 {
            sum -= a[row][c] * x[c];
        }
        x[row] = sum / a[row][row];
    }
    Some(x)
}

#[inline]
fn sample_bicubic_y(img: &RgbImage, x: u32, sy: f32) -> Rgb<u8> {
    let h = img.height();
    if h < 4 {
        return sample_bilinear(img, x as f32, sy);
    }
    let y0 = sy.floor() as i32;
    let t = sy - y0 as f32;
    let max_y = (h - 1) as i32;
    let p0 = img.get_pixel(x, (y0 - 1).clamp(0, max_y) as u32);
    let p1 = img.get_pixel(x, y0.clamp(0, max_y) as u32);
    let p2 = img.get_pixel(x, (y0 + 1).clamp(0, max_y) as u32);
    let p3 = img.get_pixel(x, (y0 + 2).clamp(0, max_y) as u32);

    let t2 = t * t;
    let t3 = t2 * t;
    let w0 = -0.5 * t + t2 - 0.5 * t3;
    let w1 = 1.0 - 2.5 * t2 + 1.5 * t3;
    let w2 = 0.5 * t + 2.0 * t2 - 1.5 * t3;
    let w3 = -0.5 * t2 + 0.5 * t3;

    let r = (p0[0] as f32 * w0 + p1[0] as f32 * w1 + p2[0] as f32 * w2 + p3[0] as f32 * w3).clamp(0.0, 255.0) as u8;
    let g = (p0[1] as f32 * w0 + p1[1] as f32 * w1 + p2[1] as f32 * w2 + p3[1] as f32 * w3).clamp(0.0, 255.0) as u8;
    let b = (p0[2] as f32 * w0 + p1[2] as f32 * w1 + p2[2] as f32 * w2 + p3[2] as f32 * w3).clamp(0.0, 255.0) as u8;
    Rgb([r, g, b])
}

/// Removes tall thin vertical/wavy lines (e.g. traditional book name/person underlines)
fn remove_bw_components(img: &mut RgbImage, max_w: u32, max_h: u32) {
    let (w, h) = img.dimensions();
    let wu = w as usize;
    let hu = h as usize;
    let mut visited = vec![false; wu * hu];
    for sy in 0..hu {
        for sx in 0..wu {
            let sidx = sy * wu + sx;
            if visited[sidx] || img.get_pixel(sx as u32, sy as u32)[0] > 128 {
                continue;
            }
            let mut stack = vec![(sx, sy)];
            let mut comp = Vec::new();
            visited[sidx] = true;
            let (mut min_x, mut max_x, mut min_y, mut max_y) = (sx, sx, sy, sy);
            while let Some((cx, cy)) = stack.pop() {
                comp.push((cx, cy));
                min_x = min_x.min(cx);
                max_x = max_x.max(cx);
                min_y = min_y.min(cy);
                max_y = max_y.max(cy);
                for (nx, ny) in [(cx.wrapping_sub(1), cy), (cx + 1, cy), (cx, cy.wrapping_sub(1)), (cx, cy + 1)] {
                    if nx < wu && ny < hu {
                        let nidx = ny * wu + nx;
                        if !visited[nidx] && img.get_pixel(nx as u32, ny as u32)[0] <= 128 {
                            visited[nidx] = true;
                            stack.push((nx, ny));
                        }
                    }
                }
            }
            let bw_w = (max_x - min_x + 1) as u32;
            let bw_h = (max_y - min_y + 1) as u32;
            if bw_w <= max_w && bw_h >= 20 && bw_h <= max_h {
                for (px, py) in comp {
                    img.put_pixel(px as u32, py as u32, Rgb([255, 255, 255]));
                }
            }
        }
    }
}

/// 3x3 morphological majority filter to smooth jagged edges / burrs on B&W text
fn deburr_bw(img: &mut RgbImage) {
    let (w, h) = img.dimensions();
    let src = img.clone();
    for y in 1..(h.saturating_sub(1)) {
        for x in 1..(w.saturating_sub(1)) {
            let c = src.get_pixel(x, y)[0] < 128;
            let mut black_neighbors = 0u8;
            for dy in -1i32..=1 {
                for dx in -1i32..=1 {
                    if dx == 0 && dy == 0 { continue; }
                    if src.get_pixel((x as i32 + dx) as u32, (y as i32 + dy) as u32)[0] < 128 {
                        black_neighbors += 1;
                    }
                }
            }
            if c && black_neighbors <= 1 {
                img.put_pixel(x, y, Rgb([255, 255, 255])); // remove protruding 1px burr
            } else if !c && black_neighbors >= 6 {
                img.put_pixel(x, y, Rgb([0, 0, 0])); // fill 1px notch
            }
        }
    }
}

/// Automatically analyzes text sharpness/blur, stroke contrast, background noise, and lighting
/// on native-resolution pixels, then tailors EnhanceParams for crisp, readable text.
pub fn analyze_page_auto_params(src: &DynamicImage) -> (EnhanceParams, String) {
    let (orig_w, orig_h) = src.dimensions();
    // Sample a native-resolution center crop (up to 720x720) so blur & noise are measured accurately
    let crop_w = orig_w.min(720);
    let crop_h = orig_h.min(720);
    let cx = (orig_w.saturating_sub(crop_w)) / 2;
    let cy = (orig_h.saturating_sub(crop_h)) / 2;
    let native_crop = src.crop_imm(cx, cy, crop_w, crop_h).to_rgb8();

    // Downscaled thumbnail for global lighting & skew check
    let thumb = src.resize(480, 480, image::imageops::FilterType::Triangle).to_rgb8();
    let (tw, th) = thumb.dimensions();

    let mut params = EnhanceParams::default();
    let mut notes = Vec::new();

    // 1. Check aspect ratio for dual-page spread
    if orig_w as f32 > orig_h as f32 * 1.18 {
        params.split_mode = "double_ltr".to_string();
        params.split_ratio = 0.5;
        notes.push("双页对开".to_string());
    }

    // 2. Measure native-resolution text sharpness (edge Laplacian) & background noise
    let cw_u = crop_w as usize;
    let ch_u = crop_h as usize;
    let mut luma_crop = vec![0i32; cw_u * ch_u];
    for (i, p) in native_crop.pixels().enumerate() {
        luma_crop[i] = ((p[0] as i32 * 77 + p[1] as i32 * 150 + p[2] as i32 * 29) >> 8);
    }

    let mut sorted_luma = luma_crop.clone();
    sorted_luma.sort_unstable();
    let ink_p5 = sorted_luma[(sorted_luma.len() * 5) / 100] as f32;
    let bg_p90 = sorted_luma[(sorted_luma.len() * 90) / 100] as f32;
    let ink_contrast = (bg_p90 - ink_p5).max(1.0);

    let mut edge_lap_sum = 0.0f64;
    let mut edge_cnt = 0u64;
    let mut flat_diff_sum = 0.0f64;
    let mut flat_cnt = 0u64;

    for y in 1..(ch_u.saturating_sub(1)) {
        for x in 1..(cw_u.saturating_sub(1)) {
            let idx = y * cw_u + x;
            let c = luma_crop[idx];
            let gx = (luma_crop[idx + 1] - luma_crop[idx - 1]).abs();
            let gy = (luma_crop[idx + cw_u] - luma_crop[idx - cw_u]).abs();
            let grad = gx + gy;
            let lap = (4 * c - luma_crop[idx - 1] - luma_crop[idx + 1] - luma_crop[idx - cw_u] - luma_crop[idx + cw_u]).abs();

            if grad > 35 {
                // Strong text edge: normalize by contrast
                edge_lap_sum += (lap as f64) / (ink_contrast as f64 / 128.0).max(0.4);
                edge_cnt += 1;
            } else if grad < 14 && c > (bg_p90 as i32 - 30) {
                // Flat paper background: measure grain/JPEG noise
                flat_diff_sum += (gx + gy) as f64 * 0.5;
                flat_cnt += 1;
            }
        }
    }

    let sharpness = if edge_cnt > 50 { edge_lap_sum / edge_cnt as f64 } else { 30.0 };
    let noise_level = if flat_cnt > 100 { flat_diff_sum / flat_cnt as f64 } else { 4.0 };

    // 3. Measure 4x4 grid background lighting unevenness
    let gw = (tw / 4).max(1);
    let gh = (th / 4).max(1);
    let mut cell_bgs = Vec::with_capacity(16);
    for gy in 0..4 {
        for gx in 0..4 {
            let mut lumas = Vec::new();
            for y in (gy * gh)..((gy + 1) * gh).min(th) {
                for x in (gx * gw)..((gx + 1) * gw).min(tw) {
                    let p = thumb.get_pixel(x, y);
                    lumas.push(((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8);
                }
            }
            if !lumas.is_empty() {
                lumas.sort_unstable();
                cell_bgs.push(lumas[(lumas.len() * 9) / 10]);
            }
        }
    }
    let bg_min = *cell_bgs.iter().min().unwrap_or(&200) as f32;
    let bg_max = *cell_bgs.iter().max().unwrap_or(&255) as f32;
    let bg_mean = cell_bgs.iter().map(|&v| v as f32).sum::<f32>() / cell_bgs.len().max(1) as f32;
    let uneven = bg_max - bg_min;

    // 4. Skew detection -> handled by Step 4 multi-grid per-line dewarp
    let skew = estimate_deskew_angle(&thumb);
    if skew.abs() > 0.35 {
        params.line_grid_dewarp = true;
        notes.push("多网格逐行展平".to_string());
    }

    // 5. Illumination fix
    if uneven > 24.0 || bg_mean < 210.0 {
        params.illumination_mode = "illumination_fix".to_string();
        params.shadow_remove_strength = ((uneven * 1.45).clamp(62.0, 92.0)).round();
        notes.push(format!("去阴影({:.0}%)", params.shadow_remove_strength));
    } else {
        params.auto_contrast = true;
    }

    // 6. Match parameters to Text Sharpness (Blur) + Noise + Contrast
    params.color_depth = "bw".to_string();
    params.binarize_method = "wolf".to_string();
    params.deburr = true;

    if sharpness < 24.0 {
        // Blurry / out-of-focus text
        params.scale_percent = 250.0;
        params.multi_scale_detail = 30.0;
        params.usm_amount = 35.0;
        params.usm_radius = 1.4;
        params.gaussian_blur_radius = if noise_level > 6.5 { 0.8 } else { 0.5 };
        params.wolf_window = 41;
        params.despeckle_size = 2;
        notes.push(format!("文字偏糊({:.1})→250%放大+细节增强", sharpness));
    } else if sharpness < 45.0 {
        // Moderate phone photo sharpness
        params.scale_percent = 200.0;
        params.usm_amount = 0.0;
        params.gaussian_blur_radius = if noise_level > 6.5 { 1.0 } else { 0.7 };
        params.wolf_window = 35;
        params.despeckle_size = 2;
        notes.push(format!("常规清晰({:.1})→200%平滑黑白", sharpness));
    } else {
        // Crisp / sharp text
        params.scale_percent = 200.0;
        params.usm_amount = 0.0;
        params.gaussian_blur_radius = 0.6;
        params.wolf_window = 31;
        params.despeckle_size = 2;
        notes.push(format!("文字锐利({:.1})→200%高清黑白", sharpness));
    }

    if noise_level > 7.5 {
        params.surface_blur_radius = 2;
        params.surface_blur_threshold = 20;
        notes.push(format!("高噪点({:.1})→表面模糊", noise_level));
    }

    if ink_contrast < 95.0 {
        // Faint text: darken midtones (gamma > 100 now darkens!) and avoid washing out light strokes
        params.contrast = 112.0;
        params.gamma = 128.0;
        params.curve_dark_y = 0.16;
        params.curve_light_y = 0.78;
        notes.push("偏淡→加深字迹".to_string());
    } else {
        params.gamma = 112.0;
        params.curve_dark_y = 0.20;
        params.curve_light_y = 0.80;
    }

    // 7. Bounded closed-loop verification (strictly max 2 fast 600px passes, never infinite!)
    for _pass in 0..2 {
        let trial = process_image(src, &params, Some(600));
        let (tw, th) = trial.dimensions();
        let x0 = tw / 5;
        let x1 = (tw * 4) / 5;
        let y0 = th / 5;
        let y1 = (th * 4) / 5;
        let mut dark_cnt = 0u32;
        let mut total_cnt = 0u32;
        for y in y0..y1 {
            for x in x0..x1 {
                total_cnt += 1;
                let p = trial.get_pixel(x, y);
                let luma = (p[0] as u16 + p[1] as u16 + p[2] as u16) / 3;
                if luma < 140 {
                    dark_cnt += 1;
                }
            }
        }
        let ink_ratio = dark_cnt as f32 / total_cnt.max(1) as f32;
        if ink_ratio < 0.015 {
            // Text was washed out: strengthen ink & back off aggressive whitening
            params.gamma = (params.gamma + 22.0).min(200.0);
            params.curve_light_y = (params.curve_light_y - 0.08).max(0.65);
            params.curve_dark_y = (params.curve_dark_y - 0.04).max(0.08);
            if params.shadow_remove_strength > 55.0 {
                params.shadow_remove_strength -= 12.0;
            }
            if _pass == 1 && ink_ratio < 0.008 {
                // Still too faint for pure B&W -> fall back to 16-level grayscale to preserve every stroke
                params.color_depth = "gray16".to_string();
                notes.push("闭环兜底:转16级灰度保字迹".to_string());
            } else {
                notes.push("闭环微调:加深防丢字".to_string());
            }
        } else if ink_ratio > 0.42 {
            // Background still too dark/dirty: boost shadow removal & push highlights
            params.shadow_remove_strength = (params.shadow_remove_strength + 14.0).min(96.0);
            params.curve_light_y = (params.curve_light_y + 0.07).min(0.92);
            params.despeckle_size = (params.despeckle_size + 1).min(6);
            notes.push("闭环微调:强化去底灰".to_string());
        } else {
            break; // Ink ratio is healthy (1.5% ~ 42%)
        }
    }

    (params, notes.join(" · "))
}

/// Pure-Rust book-page bounding box & spine-gutter detector.
/// Returns (crop_box [l, t, r, b], split_mode, split_ratio, summary).
pub fn auto_detect_crop_and_split(src: &DynamicImage) -> ([f32; 4], String, f32, String) {
    let thumb = src.resize(420, 420, image::imageops::FilterType::Triangle).to_rgb8();
    let (w, h) = thumb.dimensions();
    let wu = w as usize;
    let hu = h as usize;

    let mut row_paper = vec![0u32; hu];
    let mut col_paper = vec![0u32; wu];

    for y in 0..hu {
        for x in 0..wu {
            let p = thumb.get_pixel(x as u32, y as u32);
            let max_c = p[0].max(p[1]).max(p[2]);
            let min_c = p[0].min(p[1]).min(p[2]);
            let luma = (p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8;
            // Paper is bright & low-saturation (rejects dark keyboards, brown desks, skin/fingers)
            if luma >= 128 && (max_c - min_c) <= 46 {
                row_paper[y] += 1;
                col_paper[x] += 1;
            }
        }
    }

    let max_row = *row_paper.iter().max().unwrap_or(&1).max(&1);
    let max_col = *col_paper.iter().max().unwrap_or(&1).max(&1);

    let mut x0 = 0usize;
    let mut x1 = wu.saturating_sub(1);
    while x0 < x1 && col_paper[x0] < (max_col * 32) / 100 { x0 += 1; }
    while x1 > x0 && col_paper[x1] < (max_col * 32) / 100 { x1 -= 1; }

    let mut y0 = 0usize;
    let mut y1 = hu.saturating_sub(1);
    while y0 < y1 && row_paper[y0] < (max_row * 32) / 100 { y0 += 1; }
    while y1 > y0 && row_paper[y1] < (max_row * 32) / 100 { y1 -= 1; }

    let l = (x0 as f32 / w.max(1) as f32).clamp(0.0, 0.45);
    let t = (y0 as f32 / h.max(1) as f32).clamp(0.0, 0.45);
    let r = ((x1 + 1) as f32 / w.max(1) as f32).clamp(l + 0.2, 1.0);
    let b = ((y1 + 1) as f32 / h.max(1) as f32).clamp(t + 0.2, 1.0);

    let (orig_w, orig_h) = src.dimensions();
    let crop_w = (r - l) * orig_w as f32;
    let crop_h = (b - t) * orig_h as f32;

    let mut split_mode = "none".to_string();
    let mut split_ratio = 0.5f32;
    let mut notes = vec![format!(
        "框选书页({:.0}%~{:.0}%, {:.0}%~{:.0}%)",
        l * 100.0,
        r * 100.0,
        t * 100.0,
        b * 100.0
    )];

    if crop_w > crop_h * 1.10 {
        // Find book spine/gutter using 75th-percentile column luma (ignores text lines, isolates true vertical shadow)
        // combined with a gentle center bias around the midpoint of the cropped book.
        let gx_start = x0 + ((x1 - x0) * 38) / 100;
        let gx_end = x0 + ((x1 - x0) * 62) / 100;
        let mid_x = (x0 + x1) as f32 * 0.5;
        let span = (x1 - x0).max(1) as f32;
        let mut best_gx = (x0 + x1) / 2;
        let mut best_score = f32::MAX;

        for x in gx_start..=gx_end {
            let mut col_lumas = Vec::with_capacity(y1 - y0 + 1);
            for y in y0..=y1 {
                let p = thumb.get_pixel(x as u32, y as u32);
                col_lumas.push(((p[0] as u16 * 77 + p[1] as u16 * 150 + p[2] as u16 * 29) >> 8) as u8);
            }
            col_lumas.sort_unstable();
            let p75 = col_lumas[(col_lumas.len() * 75) / 100] as f32;
            let p50 = col_lumas[col_lumas.len() / 2] as f32;
            let dist_penalty = ((x as f32 - mid_x).abs() / span) * 140.0;
            let score = p75 * 0.65 + p50 * 0.35 + dist_penalty;
            if score < best_score {
                best_score = score;
                best_gx = x;
            }
        }
        split_mode = "double_ltr".to_string();
        split_ratio = (best_gx as f32 / w.max(1) as f32).clamp(0.25, 0.75);
        notes.push(format!("吸合中缝({:.1}%)", split_ratio * 100.0));
    }

    ([l, t, r, b], split_mode, split_ratio, notes.join(" · "))
}

fn apply_page_layout(img: &RgbImage, params: &EnhanceParams) -> RgbImage {
    let (w_mm, h_mm) = match params.page_preset.as_str() {
        "a4" => (210.0f32, 297.0f32),
        "b5" => (176.0, 250.0),
        "16k" => (185.0, 260.0),
        "32k" => (130.0, 184.0),
        "ebook43" => (150.0, 200.0),
        _ => return img.clone(),
    };
    let dpi = params.target_dpi.clamp(72, 600) as f32;
    let pw = ((w_mm / 25.4) * dpi).round() as u32;
    let ph = ((h_mm / 25.4) * dpi).round() as u32;
    let ml = ((params.margin_lr_mm / 25.4) * dpi).round() as u32;
    let mt = ((params.margin_tb_mm / 25.4) * dpi).round() as u32;

    let box_w = pw.saturating_sub(ml * 2).max(16);
    let box_h = ph.saturating_sub(mt * 2).max(16);

    let (iw, ih) = img.dimensions();
    let scale = (box_w as f32 / iw as f32).min(box_h as f32 / ih as f32);
    let nw = ((iw as f32) * scale).round().max(1.0) as u32;
    let nh = ((ih as f32) * scale).round().max(1.0) as u32;

    let resized = image::imageops::resize(img, nw, nh, image::imageops::FilterType::Lanczos3);
    let mut canvas: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::from_pixel(pw, ph, Rgb([255, 255, 255]));
    let ox = ml + (box_w.saturating_sub(nw)) / 2;
    let oy = if params.align_mode == "top_center" {
        mt
    } else {
        mt + (box_h.saturating_sub(nh)) / 2
    };
    image::imageops::overlay(&mut canvas, &resized, ox as i64, oy as i64);
    canvas
}
