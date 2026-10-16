"""Thumbnail, EXIF and perceptual-hash worker. Never modifies the original."""
import sys,json,os,subprocess,shutil,re
from PIL import Image,ImageOps,ExifTags

source,target,mime=sys.argv[1:4]
metadata={}
preview=None
def gps_decimal(parts,ref):
    result=float(parts[0])+float(parts[1])/60+float(parts[2])/3600
    return -result if ref in ('S','W') else result
if mime.startswith('video/'):
    bundled=os.path.join(os.path.dirname(__file__),'tools','ffmpeg.exe')
    ffmpeg=os.environ.get('FFMPEG_PATH') or (bundled if os.path.exists(bundled) else shutil.which('ffmpeg'))
    if not ffmpeg:
        raise RuntimeError('未安装 FFmpeg，原视频已保存；安装 FFmpeg 后可在任务中心重试生成封面。')
    conversion=subprocess.run([ffmpeg,'-y','-i',source,'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',target],check=True,capture_output=True,timeout=90)
    info=conversion.stderr.decode('utf8','replace')
    duration=re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)',info)
    if duration:metadata['durationSeconds']=round(int(duration[1])*3600+int(duration[2])*60+float(duration[3]),2)
    preview=target.replace('-thumb.jpg','-preview.mp4')
    subprocess.run([ffmpeg,'-y','-i',source,'-map','0:v:0','-map','0:a?','-vf','scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2','-c:v','libx264','-preset','veryfast','-crf','28','-c:a','aac','-movflags','+faststart',preview],check=True,capture_output=True,timeout=110)
    image=Image.open(target)
else:
    image=Image.open(source)
    exif=image.getexif()
    try:exif.update(exif.get_ifd(34665))
    except Exception:pass
    for tag,key in [(36867,'capturedAt'),(306,'capturedAt'),(271,'cameraMake'),(272,'cameraModel')]:
        if exif.get(tag):metadata.setdefault(key,str(exif[tag]))
    try:
        gps=exif.get_ifd(34853)
        if gps.get(2) and gps.get(4):metadata['gps']={'lat':gps_decimal(gps[2],gps.get(1,'')),'lng':gps_decimal(gps[4],gps.get(3,''))}
    except Exception:pass
    metadata['width'],metadata['height']=image.size
    image=ImageOps.exif_transpose(image)
image=image.convert('RGB')
small=image.resize((9,8)).convert('L')
pixels=list(small.getdata())
bits=''.join('1' if pixels[y*9+x]>pixels[y*9+x+1] else '0' for y in range(8) for x in range(8))
image.thumbnail((960,960))
image.save(target,'JPEG',quality=83,optimize=True)
print(json.dumps({'metadata':metadata,'dhash':format(int(bits,2),'016x'),'preview':os.path.basename(preview) if preview else None},ensure_ascii=False))
