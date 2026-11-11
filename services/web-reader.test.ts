import {it,expect} from 'vitest';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
const require=createRequire(import.meta.url);
const {pageReadScript}=require('../web-reader.cjs');
it('normalizes page whitespace before limiting text so sparse HTML does not lose later terms',()=>{
 const text='Offer\n\n\t$500'+' '.repeat(100010)+'Important terms: 2 deposits totaling $5000.';
 const root={textContent:text,querySelectorAll:()=>[]};
 const result=runInNewContext(pageReadScript,{document:{body:{cloneNode:()=>root},title:'Offer'},location:{href:'https://example.com'}});
 expect(result.text).toBe('Offer $500 Important terms: 2 deposits totaling $5000.');
});
