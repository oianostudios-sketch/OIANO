import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer: Buffer) { let bits=''; for(const byte of buffer) bits+=byte.toString(2).padStart(8,'0'); let out=''; for(let i=0;i<bits.length;i+=5) out+=ALPHABET[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)]; return out; }
function base32Decode(value: string) { let bits=''; for(const char of value.replace(/=+$/,'').toUpperCase()) { const index=ALPHABET.indexOf(char); if(index>=0) bits+=index.toString(2).padStart(5,'0'); } const bytes=[]; for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2)); return Buffer.from(bytes); }
export function newTotpSecret() { return base32Encode(crypto.randomBytes(20)); }
function codeAt(secret:string,counter:number){ const message=Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter)); const digest=crypto.createHmac('sha1',base32Decode(secret)).update(message).digest(); const offset=digest[digest.length-1]&15; const value=(digest.readUInt32BE(offset)&0x7fffffff)%1_000_000; return value.toString().padStart(6,'0'); }
export function verifyTotp(secret:string,code:string){ if(!/^\d{6}$/.test(code))return false; const counter=Math.floor(Date.now()/30_000); return [-1,0,1].some(delta=>{const expected=codeAt(secret,counter+delta);return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(code));}); }
// Independent from JWT_SECRET on purpose (SCALE_READINESS_ROADMAP.md Tier
// 0.6) — previously this derived from JWT_SECRET, so one leaked secret
// compromised live auth tokens AND every stored MFA secret at once. A leak
// of one no longer implies a leak of the other.
function key(){return crypto.createHash('sha256').update(process.env.MFA_ENCRYPTION_KEY!).digest();}
export function encryptTotp(secret:string){const iv=crypto.randomBytes(12);const cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const encrypted=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString('base64url')).join('.');}
export function decryptTotp(value:string){const[iv,tag,data]=value.split('.').map(x=>Buffer.from(x,'base64url'));const decipher=crypto.createDecipheriv('aes-256-gcm',key(),iv);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
export function tryDecryptTotp(value: string): string | null {
  try {
    const secret = decryptTotp(value);
    return /^[A-Z2-7]{32}$/.test(secret) ? secret : null;
  } catch {
    return null;
  }
}
