// Derived from Sprite Fusion Pixel Snapper, MIT, Copyright (c) 2025 Hugo Duprez.
// Independent palette mapping; never invoked by raster cleanup. No implicit 16-color defaults.
pub fn nearest_palette_color(rgb: [u8; 3], palette: &[[u8; 3]]) -> [u8; 3] {
    let mut best_color = palette[0];
    let mut best_distance = u32::MAX;
    for color in palette {
        let dr = rgb[0] as i32 - color[0] as i32;
        let dg = rgb[1] as i32 - color[1] as i32;
        let db = rgb[2] as i32 - color[2] as i32;
        let distance = (dr * dr + dg * dg + db * db) as u32;
        if distance < best_distance {
            best_distance = distance;
            best_color = *color;
        }
    }
    best_color
}


pub fn map_palette(rgba:&[u8], palette:&[[u8;3]])->std::result::Result<Vec<u8>, &'static str> {
 if palette.is_empty() || palette.len()>256 || rgba.len()%4!=0 {return Err("invalid explicit palette");}
 let mut out=rgba.to_vec();
 for (src,dst) in rgba.chunks_exact(4).zip(out.chunks_exact_mut(4)) {
  if src[3]!=0 {let c=nearest_palette_color([src[0],src[1],src[2]],palette);dst[..3].copy_from_slice(&c);}
 }
 Ok(out)
}
