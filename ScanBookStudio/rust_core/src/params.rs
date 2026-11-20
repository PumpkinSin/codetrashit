use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct EnhanceParams {
    // Step 1: Paper & Split
    pub rotation: i32,
    pub flip_h: bool,
    pub flip_v: bool,
    pub split_mode: String, // "none", "single_gutter", "double_ltr", "double_rtl"
    pub split_ratio: f32,
    pub split_side: String, // "left", "right"
    pub crop_box: [f32; 4], // [left, top, right, bottom]
    pub auto_crop_margin: bool,
    pub ignore_speckle_px: u32,
    pub speckle_padding_px: u32,

    // Step 2: Dewarp & Deskew
    pub auto_deskew: bool,
    pub deskew_angle: f32,
    pub perspective_enabled: bool,
    pub perspective_points: [[f32; 2]; 4],
    pub dewarp_enabled: bool,
    pub dewarp_method: String,
    pub dewarp_top_y: [f32; 3],
    pub dewarp_bottom_y: [f32; 3],
    pub illumination_uniformity: String,
    pub uvdoc_enabled: bool,
    pub uvdoc_grid: Option<Vec<f32>>, // 45*31*2 floats in [-1, 1]

    // Step 3: Scale, Enhance & Whiten
    pub scale_percent: f32,  // 25..400 (upscale >100 happens BEFORE binarization)
    pub scale_filter: String, // "lanczos3", "catmull_rom", "triangle"

    pub illumination_mode: String, // "none", "illumination_fix", "retinex", "bw_text", "bw_red_seal", "fast_fix"
    pub shadow_remove_strength: f32,
    pub auto_white_balance: bool,
    pub auto_levels: bool,
    pub auto_contrast: bool,
    pub auto_bleach: bool,
    pub invert_colors: bool,
    pub channel_mix: String,
    pub color_replace_enabled: bool,
    pub color_replace_target: [u8; 3],
    pub color_replace_to: [u8; 3],
    pub color_replace_tolerance: u8,

    pub brightness: f32,
    pub contrast: f32,
    pub gamma: f32,
    pub highlight_boost: f32,     // 0..200 (100 neutral)
    pub highlight_threshold: u8,  // 128..255
    pub light_shadows: f32,       // -100..100
    pub light_highlights: f32,    // -100..100
    pub levels_black: u8,
    pub levels_white: u8,
    pub levels_mid: f32,          // 0.3..3.0 (1.0 neutral)
    pub curve_dark_x: f32,        // 0.05..0.48
    pub curve_dark_y: f32,        // 0.0..1.0
    pub curve_light_x: f32,       // 0.52..0.95
    pub curve_light_y: f32,       // 0.0..1.0
    pub strong_bg_screen: f32,    // 0..100
    pub vibrance: f32,
    pub post_process_hist: bool,

    pub gaussian_blur_radius: f32,   // 0..5.0
    pub multi_scale_detail: f32,     // 0..100
    pub usm_passes: u8,              // 1..3
    pub usm_amount: f32,             // 0..200
    pub usm_radius: f32,             // 0.5..5.0
    pub usm_threshold: u8,           // 0..50
    pub surface_blur_passes: u8,     // 1..3
    pub surface_blur_radius: u8,     // 0..8
    pub surface_blur_threshold: u8,  // 5..80
    pub morph_op: String,            // "none", "bold", "thin", "open", "close"

    pub color_depth: String,         // "keep", "color24", "gray256", "gray16", "gray8", "gray4", "bw"
    pub binarize_method: String,     // "otsu", "wolf", "fixed"
    pub wolf_window: u32,
    pub dither: bool,
    pub dither_method: String,       // "floyd_steinberg", "bayer"
    pub despeckle_size: u32,
    pub remove_lines_enabled: bool,
    pub remove_line_max_w: u32,
    pub remove_line_max_h: u32,
    pub remove_margin_fingers: bool,
    pub remove_edge_black: bool,
    pub deburr: bool,

    // Step 4: Layout & Export
    pub line_grid_dewarp: bool,
    pub extract_illustrations: bool,
    pub filter_small_ornaments: bool,
    pub illustration_boxes: Option<Vec<[f32; 4]>>,
    pub export_format: String, // "jpg", "png_lossless", "tiff_lossless", "vector"
    pub page_preset: String,
    pub margin_lr_mm: f32,
    pub margin_tb_mm: f32,
    pub target_dpi: u32,
    pub align_mode: String, // "center", "top_center", "left_center", "right_center"
    pub jpeg_quality: u8,
    pub mixed_book_auto_bw: bool,
}

impl Default for EnhanceParams {
    fn default() -> Self {
        Self {
            rotation: 0,
            flip_h: false,
            flip_v: false,
            split_mode: "none".to_string(),
            split_ratio: 0.5,
            split_side: "both".to_string(),
            crop_box: [0.0, 0.0, 1.0, 1.0],
            auto_crop_margin: false,
            ignore_speckle_px: 3,
            speckle_padding_px: 8,

            auto_deskew: false,
            deskew_angle: 0.0,
            perspective_enabled: false,
            perspective_points: [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]],
            dewarp_enabled: false,
            dewarp_method: "expanded_text".to_string(),
            dewarp_top_y: [0.0, 0.0, 0.0],
            dewarp_bottom_y: [1.0, 1.0, 1.0],
            illumination_uniformity: "normal".to_string(),
            uvdoc_enabled: false,
            uvdoc_grid: None,

            scale_percent: 100.0,
            scale_filter: "lanczos3".to_string(),

            illumination_mode: "none".to_string(),
            shadow_remove_strength: 0.0,
            auto_white_balance: false,
            auto_levels: false,
            auto_contrast: false,
            auto_bleach: false,
            invert_colors: false,
            channel_mix: "none".to_string(),
            color_replace_enabled: false,
            color_replace_target: [200, 50, 50],
            color_replace_to: [255, 255, 255],
            color_replace_tolerance: 35,

            brightness: 100.0,
            contrast: 100.0,
            gamma: 100.0,
            highlight_boost: 100.0,
            highlight_threshold: 210,
            light_shadows: 0.0,
            light_highlights: 0.0,
            levels_black: 0,
            levels_white: 255,
            levels_mid: 1.0,
            curve_dark_x: 0.25,
            curve_dark_y: 0.25,
            curve_light_x: 0.75,
            curve_light_y: 0.75,
            strong_bg_screen: 0.0,
            vibrance: 0.0,
            post_process_hist: false,

            gaussian_blur_radius: 0.0,
            multi_scale_detail: 0.0,
            usm_passes: 1,
            usm_amount: 0.0,
            usm_radius: 1.2,
            usm_threshold: 4,
            surface_blur_passes: 1,
            surface_blur_radius: 0,
            surface_blur_threshold: 20,
            morph_op: "none".to_string(),

            color_depth: "keep".to_string(),
            binarize_method: "wolf".to_string(),
            wolf_window: 25,
            dither: false,
            dither_method: "floyd_steinberg".to_string(),
            despeckle_size: 0,
            remove_lines_enabled: false,
            remove_line_max_w: 15,
            remove_line_max_h: 200,
            remove_margin_fingers: false,
            remove_edge_black: false,
            deburr: false,

            line_grid_dewarp: false,
            extract_illustrations: false,
            filter_small_ornaments: true,
            illustration_boxes: None,
            export_format: "jpg".to_string(),
            page_preset: "original".to_string(),
            margin_lr_mm: 10.0,
            margin_tb_mm: 12.0,
            target_dpi: 300,
            align_mode: "center".to_string(),
            jpeg_quality: 85,
            mixed_book_auto_bw: false,
        }
    }
}
