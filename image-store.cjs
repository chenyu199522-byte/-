const fs = require('node:fs');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const pattern = /^[a-f0-9]{64}\.(png|jpg|webp|gif|bmp)$/;
function mimeOf(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['png','image/png'];
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return ['jpg','image/jpeg'];
  if (['GIF87a','GIF89a'].includes(bytes.toString('ascii',0,6))) return ['gif','image/gif'];
  if (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP') return ['webp','image/webp'];
  if (bytes.toString('ascii',0,2)==='BM') return ['bmp','image/bmp'];
  throw new Error('请选择 PNG、JPEG、WebP、GIF 或 BMP 图片。');
}
function createImageStore(directory, nativeImage) {
  const staged = new Map();
  const location = id => {
    if (!pattern.test(id)) throw new Error('图片标识无效。');
    return path.join(directory,id);
  };
  function read(id) {
    const file=location(id);
    const bytes=staged.get(id) || fs.readFileSync(file);
    if (createHash('sha256').update(bytes).digest('hex') !== id.split('.')[0])
      throw new Error('图片内容校验失败，请检查备份。');
    return bytes;
  }
  async function prepare(files) {
    const pending=[];
    // Validate the complete selection before exposing any of it to the editor.
    for(const file of files) {
      if ((await fs.promises.stat(file)).size > MAX_IMAGE_BYTES) throw new Error('单张图片请控制在 25 MB 以内。');
      const bytes=await fs.promises.readFile(file);
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error('单张图片请控制在 25 MB 以内。');
      const [ext,mime]=mimeOf(bytes);
      if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error('图片无法读取，请检查文件。');
      const id=createHash('sha256').update(bytes).digest('hex')+'.'+ext;
      pending.push({bytes,info:{id,name:path.basename(file),mime,size:bytes.length,addedAt:new Date().toISOString()}});
    }
    for(const item of pending) staged.set(item.info.id,item.bytes);
    return pending.map(item=>item.info);
  }
  function commit(state, previous) {
    const existing=new Set((previous?.offers || []).flatMap(o=>(o.images || []).map(i=>i.id)));
    for(const item of state.offers.flatMap(o=>o.images || [])) {
      const target=location(item.id);
      if (existing.has(item.id)) continue;
      const bytes=read(item.id);
      if (bytes.length!==item.size || mimeOf(bytes)[1]!==item.mime) throw new Error('图片信息不匹配。');
      fs.mkdirSync(directory,{recursive:true});
      if (fs.existsSync(target)) continue;
      const temp=target+'.'+randomUUID()+'.tmp';
      try {
        fs.writeFileSync(temp,bytes,{flag:'wx',flush:true});
        fs.renameSync(temp,target);
      } finally {fs.rmSync(temp,{force:true});}
    }
  }
  function prune(state, previous) {
    const keep=new Set(state.offers.flatMap(o=>(o.images || []).map(i=>i.id)));
    const old=new Set((previous?.offers || []).flatMap(o=>(o.images || []).map(i=>i.id)));
    for(const id of old) {
      if(keep.has(id)) continue;
      try { fs.rmSync(location(id),{force:true}); } catch { /* The saved record remains authoritative if a file is locked. */ }
    }
  }
  function preview(id, full) {
    const bytes=read(id);
    if(full) return 'data:'+mimeOf(bytes)[1]+';base64,'+bytes.toString('base64');
    const picture=nativeImage.createFromBuffer(bytes);
    if(picture.isEmpty()) throw new Error('图片无法读取。');
    const size=picture.getSize();
    return picture.resize({width:Math.min(420,size.width)}).toDataURL();
  }
  return {prepare,commit,prune,read,preview,discard:ids=>ids.forEach(id=>staged.delete(id))};
}
module.exports={createImageStore,MAX_IMAGE_BYTES};
