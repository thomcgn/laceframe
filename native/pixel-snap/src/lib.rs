//! Laceframe adaptation of Sprite Fusion Pixel Snapper (see LICENSE and README).
//! Raster analysis/cleanup and palette mapping are independently callable.
//! The raster path never invokes quantization, a codec or an image resize.
pub mod grid;
pub mod palette;
use grid::{Config,RgbaImage};
use std::collections::HashMap;
const MAX_PIXELS:usize=4_194_304;
fn image<'a>(data:&'a [u8],width:u32,height:u32)->Result<RgbaImage<'a>, &'static str>{
 if width<1||height<1||width as usize*height as usize>MAX_PIXELS||data.len()!=width as usize*height as usize*4{return Err("invalid native RGBA dimensions");}
 Ok(RgbaImage{width,height,data})
}
pub fn analyze(data:&[u8],width:u32,height:u32)->Result<Option<u32>, &'static str>{
 let img=image(data,width,height)?;
 if width<3||height<3{return Ok(None);}
 let (x,y)=grid::compute_profiles(&img).map_err(|_|"profiles failed")?;
 let c=Config::default();
 let (sx,sy)=(grid::estimate_step_size(&x,&c),grid::estimate_step_size(&y,&c));
 // Never promote upstream's fallback-to-64-segments into a claimed measured grid.
 match (sx,sy) { (Some(a),Some(b)) if a>=2.0&&b>=2.0&&a<=32.0&&b<=32.0&&(a-b).abs()<=1.0 => Ok(Some(((a+b)/2.0).round() as u32)), _=>Ok(None) }
}
#[derive(Debug)]
pub struct Cleaned {pub data:Vec<u8>,pub changed:u32,pub ambiguous:u32}
/// Adapted from upstream resample's cell histogram / dominant RGBA selection.
/// Instead of a one-pixel-per-cell output, inspect the existing native coordinates.
/// Minority RGB changes require local support and bounded color distance. Preserve alpha,
/// protected pixels, contrasting details and ambiguous cells. No reconstruction/upscaling.
pub fn clean(data:&[u8],protection:&[u8],width:u32,height:u32,step:u32,strong:bool)->Result<Cleaned,&'static str>{
 let img=image(data,width,height)?;
 let (w,h)=(width as usize,height as usize);
 if protection.len()!=w*h||!(2..=32).contains(&step){return Err("invalid protection or grid");}
 let mut result=Cleaned{data:data.to_vec(),changed:0,ambiguous:0};
 if w<3||h<3{return Ok(result);}
 let (px,py)=grid::compute_profiles(&img).map_err(|_|"profiles failed")?;
 let c=Config::default();
 let cx=grid::walk(&px,step as f64,w,&c).map_err(|_|"grid walker failed")?;
 let cy=grid::walk(&py,step as f64,h,&c).map_err(|_|"grid walker failed")?;
 let (cols,rows)=grid::stabilize_both_axes(&px,&py,cx,cy,w,h,&c);
 let threshold=if strong{80}else{48};
 for ys in rows.windows(2){for xs in cols.windows(2){
  let mut counts:HashMap<[u8;3],(usize,usize)>=HashMap::new();let mut total=0;
  for y in ys[0]..ys[1]{for x in xs[0]..xs[1]{let i=y*w+x;let k=i*4;if data[k+3]!=255{continue;}
   let entry=counts.entry([data[k],data[k+1],data[k+2]]).or_insert((0,i));entry.0+=1;total+=1;
  }}
  // Explicit tie order; randomized HashMap iteration must not change the output.
  let mut candidates:Vec<_>=counts.into_iter().collect();
  candidates.sort_by(|a,b|b.1.0.cmp(&a.1.0).then(a.0.cmp(&b.0)));
  let Some((color,(count,_)))=candidates.first() else {continue;};
  if total<4 || count*100 < total*if strong{70}else{85}{continue;}
  for y in ys[0]..ys[1]{for x in xs[0]..xs[1]{let i=y*w+x;let k=i*4;
   if data[k+3]!=255||protection[i]!=0||data[k..k+3]==color[..]{continue;}
   let distance=(0..3).map(|c|(data[k+c] as i32-color[c] as i32).abs()).max().unwrap();
   if distance>threshold{result.ambiguous+=1;continue;}
   let mut support=0;
   for n in [x.checked_sub(1).map(|_|i-1),(x+1<w).then_some(i+1),y.checked_sub(1).map(|_|i-w),(y+1<h).then_some(i+w)].into_iter().flatten(){
    if data[n*4+3]==255&&data[n*4..n*4+3]==color[..]{support+=1;}
   }
   if support<2{result.ambiguous+=1;continue;}
   result.data[k..k+3].copy_from_slice(color);result.changed+=1;
  }}
 }}
 Ok(result)
}
// Small owned-buffer WASM ABI; only the typed internal JS adapter supplies pointers.
// All dimensions/lengths are checked before slices and processing. No host imports.
#[no_mangle]
pub extern "C" fn allocate(len:usize)->*mut u8 {let v=vec![0u8;len].into_boxed_slice();Box::into_raw(v) as *mut u8}
#[no_mangle]
pub unsafe extern "C" fn release(ptr:*mut u8,len:usize){if !ptr.is_null(){drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr,len)));}}
#[no_mangle]
pub unsafe extern "C" fn analyze_rgba(ptr:*const u8,len:usize,w:u32,h:u32)->u32{
 if ptr.is_null()||len>MAX_PIXELS*4{return 0;}
 analyze(std::slice::from_raw_parts(ptr,len),w,h).ok().flatten().unwrap_or(0)
}
#[no_mangle]
pub unsafe extern "C" fn clean_rgba(ptr:*const u8,len:usize,mask:*const u8,mask_len:usize,w:u32,h:u32,step:u32,strong:u32,out:*mut u8,stats:*mut u32)->u32{
 if ptr.is_null()||mask.is_null()||out.is_null()||stats.is_null()||len>MAX_PIXELS*4||mask_len>MAX_PIXELS{return 0;}
 match clean(std::slice::from_raw_parts(ptr,len),std::slice::from_raw_parts(mask,mask_len),w,h,step,strong!=0){
  Ok(r)=>{std::ptr::copy_nonoverlapping(r.data.as_ptr(),out,len);*stats=r.changed;*stats.add(1)=r.ambiguous;1},Err(_)=>0,
 }
}
/// Optional explicit palette quantization. Independent export, never called by clean_rgba.
#[no_mangle]
pub unsafe extern "C" fn quantize_rgba_to_palette(ptr:*const u8,len:usize,colors:*const u8,color_len:usize,out:*mut u8)->u32 {
 if ptr.is_null()||colors.is_null()||out.is_null()||len>MAX_PIXELS*4||color_len==0||color_len>768||color_len%3!=0{return 0;}
 let palette:Vec<[u8;3]>=std::slice::from_raw_parts(colors,color_len).chunks_exact(3).map(|v|[v[0],v[1],v[2]]).collect();
 match palette::map_palette(std::slice::from_raw_parts(ptr,len),&palette){Ok(result)=>{std::ptr::copy_nonoverlapping(result.as_ptr(),out,len);1},Err(_)=>0}
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn raster_and_palette_are_separate(){
  let mut p=vec![100u8;32*32*4];for c in p.chunks_exact_mut(4){c[3]=255;}p[0]=120;p[4]=200;p[7]=0;
  let source=p.clone();let out=clean(&p,&vec![0;1024],32,32,4,false).unwrap();
  assert_eq!(out.data.len(),p.len());assert_eq!(out.data[7],0);assert_eq!(&out.data[4..8],&p[4..8]);assert_eq!(p,source);
  let palette=palette::map_palette(&p,&[[10,20,30]]).unwrap();assert_ne!(out.data,palette);
 }
 #[test]fn ambiguous_analysis_is_none(){assert_eq!(analyze(&vec![0;1024],16,16).unwrap(),None);}
 #[test]fn partial_alpha_and_protection_exact(){let p=vec![100;16*16*4];assert_eq!(clean(&p,&vec![255;256],16,16,4,true).unwrap().data,p);}
 #[test]fn noisy_cells_clean_without_quantization(){
 let(w,h)=(32usize,24usize);let mut data=vec![0u8;w*h*4];
 for y in 4..h-4{for x in 4..w-4{let c=if(x/4+y/4)%2==1{[130,90,70,255]}else{[40,70,90,255]};data[(y*w+x)*4..(y*w+x)*4+4].copy_from_slice(&c);}}
 data[(5*w+5)*4..(5*w+5)*4+4].copy_from_slice(&[55,85,105,255]);
 data[(6*w+6)*4..(6*w+6)*4+4].copy_from_slice(&[0,0,0,255]);data[(4*w+4)*4+3]=73;
 let img=image(&data,w as u32,h as u32).unwrap();let (px,py)=grid::compute_profiles(&img).unwrap();let c=Config::default();
 let (x,y)=grid::stabilize_both_axes(&px,&py,grid::walk(&px,4.0,w,&c).unwrap(),grid::walk(&py,4.0,h,&c).unwrap(),w,h,&c);
 assert_eq!(x[2],8);assert_eq!(y[2],8);
 let r=clean(&data,&vec![0;w*h],w as u32,h as u32,4,false).unwrap();assert!(r.changed>0);
 }
 #[test]fn explicit_palette_is_bounded(){assert!(palette::map_palette(&[0,0,0,0],&[]).is_err());}
}
