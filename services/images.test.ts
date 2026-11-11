import {afterAll,afterEach, expect, it} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {emptyOffer,emptyState} from './bank-rewards/types';
import {validateState} from './bank-rewards/logic';
const {createImageStore}=createRequire(import.meta.url)('../image-store.cjs');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'gf-image-store-'));
afterEach(()=>{for(const entry of fs.readdirSync(temp))fs.rmSync(path.join(temp,entry),{recursive:true,force:true});});
afterAll(()=>fs.rmdirSync(temp));
// Storage tests use a decoder stub. Packaged desktop tests exercise the real Electron decoder.
const decoder={createFromBuffer:()=>({isEmpty:()=>false})};
function input(name='picture.png') {
  const file=path.join(temp,name);
  fs.writeFileSync(file,Buffer.from([137,80,78,71,13,10,26,10,1,2,3]));
  return file;
}
it('retains a shared image until the last referencing offer removes it',async()=>{
  const dir=path.join(temp,'images'), store=createImageStore(dir,decoder);
  const [item]=await store.prepare([input()]);
  const old={offers:[]}, both={offers:[{images:[item]},{images:[item]}]};
  store.commit(both,old);
  store.discard([item.id]);
  const one={offers:[{images:[]},{images:[item]}]};
  store.prune(one,both);
  expect(store.read(item.id)).toEqual(fs.readFileSync(input('second.png')));
  store.prune(old,one);
  expect(fs.existsSync(path.join(dir,item.id))).toBe(false);
});
it('rejects damaged originals and paths outside the image directory',async()=>{
  const dir=path.join(temp,'images'), store=createImageStore(dir,decoder);
  const [item]=await store.prepare([input()]);
  store.commit({offers:[{images:[item]}]},{offers:[]});store.discard([item.id]);
  fs.writeFileSync(path.join(dir,item.id),'broken');
  expect(()=>store.read(item.id)).toThrow('图片内容校验失败');
  expect(()=>store.read('../records.json')).toThrow('图片标识无效');
});
it('accepts older offers and validates new attachment metadata before saving',()=>{
  const s=emptyState('local');s.offers=[{...emptyOffer('local'),id:'offer',bankName:'Test'}];
  s.offers[0].closureSourceUrl='https://example.com/old-closure';
  expect(()=>validateState(s)).not.toThrow();
  s.offers[0].referralUrl='javascript:alert(1)';
  expect(()=>validateState(s)).toThrow('来源链接');
  s.offers[0].referralUrl='https://example.com/referral';
  s.offers[0].images=[{id:'../x.png',name:'x.png',size:4,mime:'image/png',addedAt:new Date().toISOString()}];
  expect(()=>validateState(s)).toThrow('图片信息');
});
