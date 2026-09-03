/* Minimal dependency-free QR encoder for BOP MASTER Lift.
   Fixed QR version 8, error correction L, byte mode, mask 0. */
(function(global){'use strict';
  const VERSION=8,SIZE=49,DATA_CODEWORDS=194,BLOCKS=2,ECC_PER_BLOCK=24;
  const EXP=new Uint8Array(512),LOG=new Uint8Array(256);
  let x=1;for(let i=0;i<255;i++){EXP[i]=x;LOG[x]=i;x<<=1;if(x&256)x^=0x11d}for(let i=255;i<512;i++)EXP[i]=EXP[i-255];
  const mul=(a,b)=>a&&b?EXP[LOG[a]+LOG[b]]:0;
  function generator(degree){const result=new Uint8Array(degree);result[degree-1]=1;let root=1;for(let i=0;i<degree;i++){for(let j=0;j<degree;j++)result[j]=mul(result[j],root);for(let j=0;j<degree-1;j++)result[j]^=result[j+1];root=mul(root,2)}return result}
  function remainder(data,degree){const divisor=generator(degree),out=new Uint8Array(degree);for(const value of data){const factor=value^out[0];out.copyWithin(0,1);out[degree-1]=0;for(let i=0;i<degree;i++)out[i]^=mul(divisor[i],factor)}return out}
  function appendBits(bits,value,count){for(let i=count-1;i>=0;i--)bits.push((value>>>i)&1)}
  function codewords(text){
    const bytes=new TextEncoder().encode(text);if(bytes.length>190)throw new Error('QR URL is too long');
    const bits=[];appendBits(bits,4,4);appendBits(bits,bytes.length,8);for(const b of bytes)appendBits(bits,b,8);
    appendBits(bits,0,Math.min(4,DATA_CODEWORDS*8-bits.length));while(bits.length%8)bits.push(0);
    const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j++)value=(value<<1)|bits[i+j];data.push(value)}
    for(let pad=0;data.length<DATA_CODEWORDS;pad++)data.push(pad%2?0x11:0xec);
    const blockLen=DATA_CODEWORDS/BLOCKS,blocks=[],ecc=[];
    for(let b=0;b<BLOCKS;b++){const part=Uint8Array.from(data.slice(b*blockLen,(b+1)*blockLen));blocks.push(part);ecc.push(remainder(part,ECC_PER_BLOCK))}
    const result=[];for(let i=0;i<blockLen;i++)for(let b=0;b<BLOCKS;b++)result.push(blocks[b][i]);for(let i=0;i<ECC_PER_BLOCK;i++)for(let b=0;b<BLOCKS;b++)result.push(ecc[b][i]);return result;
  }
  function matrix(text){
    const modules=Array.from({length:SIZE},()=>new Uint8Array(SIZE)),fn=Array.from({length:SIZE},()=>new Uint8Array(SIZE));
    function set(x,y,dark){if(x>=0&&y>=0&&x<SIZE&&y<SIZE){modules[y][x]=dark?1:0;fn[y][x]=1}}
    function finder(cx,cy){for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const dist=Math.max(Math.abs(dx),Math.abs(dy));set(cx+dx,cy+dy,dist!==2&&dist!==4)}}
    function alignment(cx,cy){for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}
    finder(3,3);finder(SIZE-4,3);finder(3,SIZE-4);
    for(let i=0;i<SIZE;i++){if(!fn[6][i])set(i,6,i%2===0);if(!fn[i][6])set(6,i,i%2===0)}
    const centers=[6,24,42];for(const cy of centers)for(const cx of centers)if(!fn[cy][cx])alignment(cx,cy);
    function bchVersion(v){let rem=v;for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1f25);return(v<<12)|rem}
    const vb=bchVersion(VERSION);for(let i=0;i<18;i++){const bit=((vb>>>i)&1)!==0,a=SIZE-11+(i%3),b=Math.floor(i/3);set(a,b,bit);set(b,a,bit)}
    function format(){const data=8;let rem=data;for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);const bits=((data<<10)|rem)^0x5412,bit=i=>((bits>>>i)&1)!==0;for(let i=0;i<=5;i++)set(8,i,bit(i));set(8,7,bit(6));set(8,8,bit(7));set(7,8,bit(8));for(let i=9;i<15;i++)set(14-i,8,bit(i));for(let i=0;i<8;i++)set(SIZE-1-i,8,bit(i));for(let i=8;i<15;i++)set(8,SIZE-15+i,bit(i));set(8,SIZE-8,true)}
    format();
    const raw=codewords(text),bits=[];for(const value of raw)appendBits(bits,value,8);let index=0,up=true;
    for(let right=SIZE-1;right>=1;right-=2){if(right===6)right=5;for(let v=0;v<SIZE;v++){const y=up?SIZE-1-v:v;for(let j=0;j<2;j++){const xx=right-j;if(!fn[y][xx]){const bit=index<bits.length?bits[index++]:0;modules[y][xx]=bit^(((xx+y)&1)===0)?1:0}}}up=!up}
    return modules;
  }
  function svg(text){const m=matrix(text),quiet=4,size=SIZE+quiet*2,path=[];for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(m[y][x])path.push('M'+(x+quiet)+' '+(y+quiet)+'h1v1h-1z');return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'" role="img" aria-label="QR-код"><rect width="100%" height="100%" fill="#fff"/><path d="'+path.join('')+'" fill="#000"/></svg>'}
  global.BopQR={svg};
})(window);
