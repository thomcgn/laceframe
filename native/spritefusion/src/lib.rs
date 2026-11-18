//! RGBA/PNG transport and independent palette entry point. Vendored algorithms unchanged.
#[allow(dead_code)]
mod upstream {
    include!("../vendor/src/lib.rs");
    pub fn palette_only(img: &image::RgbaImage, colors: u32, palette: Option<String>) -> Result<image::RgbaImage> {
        if let Some(hex) = palette { return apply_palette(img, &parse_palette_hex(&hex)?); }
        let config = Config { k_colors: colors as usize, ..Default::default() };
        quantize_image(img, &config)
    }
}
use image::{ImageBuffer, Rgba};
use wasm_bindgen::prelude::*;
#[wasm_bindgen]
pub fn process_rgba(data: &[u8], width: u32, height: u32, colors: u32, pixel_size: Option<f64>, palette: Option<String>) -> Result<Vec<u8>, JsValue> {
    let count = (width as u64) * (height as u64);
    if width < 2 || height < 2 || count > 4_194_304 || data.len() as u64 != count * 4 || colors < 1 || colors > 256 || count * (colors as u64) > 67_108_864 {
        return Err(JsValue::from_str("Sprite Fusion: RGBA/Palette/work budget exceeded"));
    }
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, data.to_vec()).ok_or_else(|| JsValue::from_str("Invalid RGBA"))?;
    let mut bytes = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png).map_err(|e| JsValue::from_str(&e.to_string()))?;
    upstream::process_image(&bytes, Some(colors), pixel_size, palette)
}
#[wasm_bindgen]
pub fn decode_png(bytes: &[u8]) -> Result<Vec<u8>, JsValue> {
    let reader = image::io::Reader::new(std::io::Cursor::new(bytes)).with_guessed_format().map_err(|e| JsValue::from_str(&e.to_string()))?;
    let (w, h) = reader.into_dimensions().map_err(|e| JsValue::from_str(&e.to_string()))?;
    if (w as u64) * (h as u64) > 4_194_304 { return Err(JsValue::from_str("Output too large")); }
    image::load_from_memory(bytes).map(|img| img.to_rgba8().into_raw()).map_err(|e| JsValue::from_str(&e.to_string()))
}

/// Independent original quantizer: no grid detection or geometry change.
#[wasm_bindgen]
pub fn quantize_rgba(data: &[u8], width: u32, height: u32, colors: u32, palette: Option<String>) -> Result<Vec<u8>, JsValue> {
    let count = width as u64 * height as u64;
    if count == 0 || count > 4_194_304 || data.len() as u64 != count * 4 || colors < 1 || colors > 256 || count * colors as u64 > 67_108_864 {
        return Err(JsValue::from_str("Palette work budget exceeded"));
    }
    let img = ImageBuffer::<Rgba<u8>, _>::from_raw(width, height, data.to_vec()).ok_or_else(|| JsValue::from_str("Invalid RGBA"))?;
    upstream::palette_only(&img, colors, palette).map(|p| p.into_raw()).map_err(|e| JsValue::from_str(&e.to_string()))
}
