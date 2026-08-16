import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';

const SignatureUniverse3D = lazy(() => import('../components/SignatureUniverse3D'));
import OianoBrand from '../components/OianoBrand';

function UniverseFallback() {
  return <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 48% 42%, rgba(58,111,142,.18), transparent 24%), radial-gradient(circle at 52% 48%, rgba(201,168,76,.08), transparent 44%), #020304' }} />;
}

function AdaptiveUniverse({ intensified }: { intensified: boolean }) {
  const [supports3D, setSupports3D] = useState(false);
  useEffect(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const desktop = window.matchMedia('(min-width: 761px)').matches;
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    let webgl = false;
    try {
      const canvas = document.createElement('canvas');
      webgl = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
    } catch { webgl = false; }
    setSupports3D(desktop && !reducedMotion && memory >= 4 && cores >= 4 && webgl);
  }, []);
  if (!supports3D) return <UniverseFallback />;
  return <Suspense fallback={<UniverseFallback />}><SignatureUniverse3D intensified={intensified} /></Suspense>;
}

export default function EnterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [converging, setConverging] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [mfa, setMfa] = useState<{challenge:string;setup:boolean;secret?:string;uri?:string}|null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const requestedNext = searchParams.get('next');
  const returningToBooking = requestedNext?.startsWith('/book') || requestedNext?.startsWith('/calendar');
  const safeNext = requestedNext?.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : null;

  async function handleEnter() {
    setLoading(true); setError('');
    try {
      const { data } = await api.post(mode === 'signup' ? '/auth/signup' : '/auth/login', {
        email,
        password,
        ...(mode === 'signup' ? { role: 'ARTIST' } : {}),
      });
      if (data.mfa_required) { setMfa({challenge:data.challenge,setup:data.mfa_setup,secret:data.secret,uri:data.otpauth_uri}); setLoading(false); return; }
      completeLogin(data);
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'We could not sign you in. Check your details and try again.');
      setLoading(false);
    }
  }

  function completeLogin(data:any) {
      setAuth(data.token, data.user);
      setConverging(true);
      setTimeout(() => {
        if (data.user.role === 'STUDIO_ADMIN') navigate('/admin');
        else if (data.user.role === 'OIANO_ADMIN') navigate('/maintenance');
        else if (mode === 'signup') navigate(`/onboarding${safeNext ? `?next=${encodeURIComponent(safeNext)}` : ''}`);
        else if (data.user.role === 'ARTIST' && safeNext) navigate(safeNext);
        else if (data.user.role === 'ARTIST') navigate('/calendar');
        else navigate('/dashboard');
      }, 850);
  }

  async function handleMfa(){setLoading(true);setError('');try{const{data}=await api.post('/auth/mfa/verify',{challenge:mfa?.challenge,code:mfaCode});completeLogin(data);}catch(err:any){setError(err.response?.data?.error??'Authenticator code could not be verified.');setLoading(false);}}

  return (
    <main className="login-shell page-enter">
      <style>{`
        .enter-wordmark{position:relative;display:flex;align-items:baseline;font-family:'Playfair Display',serif;font-size:clamp(4rem,9vw,6.8rem);font-weight:600;line-height:.86;perspective:700px;transform:rotateX(5deg);filter:drop-shadow(0 18px 18px rgba(0,0,0,.55)) drop-shadow(0 0 46px rgba(201,168,76,.12))}.enter-wordmark span{position:relative;display:inline-block;color:#d1af55;background:linear-gradient(180deg,#fff0b0 0%,#d8b354 18%,#9c7021 57%,#e1bd60 78%,#704916 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:1px 1px 0 rgba(255,240,178,.16),2px 2px 0 #8a611d,3px 3px 0 #67430f,4px 5px 7px rgba(0,0,0,.58);transform:translateZ(0);transition:filter .25s ease,transform .25s ease}.enter-wordmark span:after{content:attr(data-letter);position:absolute;inset:0;z-index:2;color:transparent;-webkit-text-stroke:.55px rgba(255,237,169,.34);text-shadow:-1px -1px 0 rgba(255,248,205,.22);pointer-events:none}.enter-wordmark:hover span{filter:brightness(1.08);transform:translateY(-1px)}.enter-wordmark .w-o1{margin-right:.055em}.enter-wordmark .w-i{font-size:.88em;margin-right:.065em}.enter-wordmark .w-a{font-size:1.04em;margin-right:.035em}.enter-wordmark .w-n{margin-right:.045em}.enter-wordmark .w-o2{position:relative}.enter-wordmark .w-o2:before{content:'';position:absolute;z-index:3;right:-10%;top:16%;width:.07em;height:.07em;border-radius:50%;background:#fff1bd;box-shadow:0 0 10px #d6a946}.enter-orbit{position:absolute!important;z-index:4;inset:8% -8% 2% -8%;border:1px solid rgba(232,201,113,.34);border-radius:50%;transform:rotate(-18deg) scaleX(1.18)!important;box-shadow:inset 0 0 8px rgba(255,230,145,.06),0 0 18px rgba(201,168,76,.09);pointer-events:none}.enter-wordmark-ground{width:72%;height:10px;margin-top:10px;border-radius:50%;background:radial-gradient(ellipse,rgba(191,137,39,.16),rgba(0,0,0,0) 70%);filter:blur(5px)}.enter-wordmark-rule{width:clamp(170px,22vw,270px);height:1px;margin-top:9px;background:linear-gradient(90deg,transparent,rgba(201,168,76,.42),transparent)}
        .enter-orbit-signal{position:absolute!important;z-index:6;inset:-2%;border-radius:50%;animation:orbit-signal-spin 2.4s linear infinite;transform-origin:50% 50%!important;pointer-events:none}.enter-orbit-signal:before{content:'';position:absolute;left:47%;top:-4%;width:10%;height:10%;border-radius:50%;background:#fff9dc;box-shadow:0 0 5px #fff,0 0 12px #ffe797,0 0 24px rgba(229,176,67,.85);animation:orbit-signal-charge 9.6s linear infinite}.enter-orbit-signal:after{content:'';position:absolute;left:32%;top:-3%;width:34%;height:12%;border-radius:50%;background:linear-gradient(90deg,transparent,rgba(255,230,135,.2),#fff9dc);filter:blur(3px);transform:rotate(-4deg);animation:orbit-tail-charge 9.6s linear infinite}.enter-orbit-pulse{position:absolute!important;z-index:5;right:-12%;top:13%;width:13%;aspect-ratio:1;border-radius:50%;background:#fff7cc;animation:orbit-node-charge 9.6s linear infinite;pointer-events:none}@keyframes orbit-signal-spin{to{transform:rotate(360deg)}}@keyframes orbit-signal-charge{0%,24%{opacity:.36;filter:brightness(1)}25%,49%{opacity:.55;filter:brightness(1.7)}50%,74%{opacity:.78;filter:brightness(2.5)}75%,96%{opacity:1;filter:brightness(3.7)}100%{opacity:.36;filter:brightness(1)}}@keyframes orbit-tail-charge{0%,24%{opacity:.16}25%,49%{opacity:.3}50%,74%{opacity:.48}75%,96%{opacity:.78}100%{opacity:.16}}@keyframes orbit-node-charge{0%,24%{box-shadow:0 0 7px #e1b64e;filter:brightness(1);transform:scale(.72)}25%,49%{box-shadow:0 0 10px #ffe89c,0 0 18px rgba(222,167,55,.5);filter:brightness(1.6);transform:scale(.86)}50%,74%{box-shadow:0 0 13px #fff2bc,0 0 26px rgba(235,185,73,.7);filter:brightness(2.4);transform:scale(1)}75%,96%{box-shadow:0 0 18px #fff,0 0 38px #e0aa3e,0 0 65px rgba(230,169,53,.65);filter:brightness(3.5);transform:scale(1.22)}100%{box-shadow:0 0 7px #e1b64e;filter:brightness(1);transform:scale(.72)}}@media(prefers-reduced-motion:reduce){.enter-orbit-signal{animation-duration:12s}.enter-orbit-signal:before,.enter-orbit-signal:after,.enter-orbit-pulse{animation:none;opacity:.5;filter:none}}
        .enter-brand-copy{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column;align-items:center;justify-content:center;padding-bottom:16%;pointer-events:none}.enter-trust{position:absolute;left:clamp(28px,5vw,72px);right:clamp(28px,5vw,72px);bottom:54px;z-index:3;display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.enter-trust-item{padding:14px 16px;border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(5,5,5,.48);backdrop-filter:blur(14px)}.enter-trust-item strong{display:block;color:#ddd7cc;font-size:11px;margin-top:7px}.enter-trust-item span{color:#656565;font-size:10px;line-height:1.4}.enter-field{position:relative}.enter-field label{display:block;margin:0 0 7px 2px;color:#777;font-size:10px;letter-spacing:.1em;text-transform:uppercase}.enter-input{width:100%;box-sizing:border-box;background:#0f0f0f;border:1px solid #252525;color:#f0ede8;border-radius:11px;padding:14px 16px;font-size:14px;outline:none;transition:border-color .18s,box-shadow .18s}.enter-input:focus{border-color:#5A9BCB;box-shadow:0 0 0 3px rgba(90,155,203,.1)}.enter-eye{position:absolute;right:11px;bottom:10px;width:30px;height:30px;display:grid;place-items:center;border:0;background:transparent;color:#666;cursor:pointer}.enter-submit{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;background:#5A9BCB;color:#000;font-weight:700;font-size:14px;padding:14px 20px;border-radius:11px;border:0;letter-spacing:.03em;transition:.18s}.enter-submit:not(:disabled):hover{background:#71add5;transform:translateY(-1px);box-shadow:0 10px 30px rgba(90,155,203,.15)}.enter-submit:disabled{opacity:.5;cursor:not-allowed}.enter-status{display:flex;align-items:flex-start;gap:8px;margin-top:18px;color:#656565;font-size:10px;line-height:1.5}.enter-mobile-brand{display:none}@media(max-width:760px){.login-brand-panel{display:none!important}.login-form-panel{min-height:100vh;padding:32px 24px;background:radial-gradient(circle at 50% 0,rgba(201,168,76,.08),transparent 38%),#080808}.login-form-inner{max-width:390px}.enter-mobile-brand{display:block}.enter-trust{display:none}}
        /* Professional wordmark pass: quiet material depth, generous safe area. */
        .enter-brand-copy{padding-bottom:11%}.enter-wordmark{font-size:clamp(3.6rem,7.2vw,5.7rem);font-weight:500;line-height:1;perspective:none;transform:none;filter:drop-shadow(0 10px 22px rgba(0,0,0,.4))}.enter-wordmark span{background:linear-gradient(180deg,#f0dfac 0%,#c8a75b 42%,#9b7735 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 1px 0 rgba(255,245,210,.22),0 2px 0 rgba(88,60,15,.7),0 8px 18px rgba(0,0,0,.36)}.enter-wordmark span:after{-webkit-text-stroke:.35px rgba(255,244,207,.3);text-shadow:none}.enter-wordmark:hover span{filter:none;transform:none}.enter-wordmark-ground{width:58%;height:7px;margin-top:7px;opacity:.55}.enter-wordmark-rule{margin-top:11px;opacity:.65}.enter-orbit{border-color:rgba(225,197,126,.22);box-shadow:none}.enter-orbit-signal{animation-duration:6.4s;opacity:.48}.enter-orbit-signal:before{width:6%;height:6%;background:#f6e7ba;box-shadow:0 0 6px rgba(239,205,121,.7);animation:none}.enter-orbit-signal:after{display:none}.enter-orbit-pulse{right:-9%;top:16%;width:7%;background:#f1d995;animation:professional-node 6.4s ease-in-out infinite}.enter-wordmark .w-o2:before{display:none}@keyframes professional-node{0%,70%,100%{opacity:.45;box-shadow:0 0 5px rgba(215,178,85,.55);transform:scale(.8)}84%{opacity:.9;box-shadow:0 0 9px rgba(255,229,157,.8),0 0 18px rgba(198,145,41,.28);transform:scale(1)}}@media(max-height:720px) and (min-width:761px){.enter-brand-copy{padding-bottom:20%}.enter-trust{bottom:24px}.enter-wordmark{font-size:clamp(3.2rem,6.5vw,5rem)}}
        /* OIA / NO brand logic: warm creative identity, cool operating system. */
        .enter-wordmark .w-a{margin-right:.17em}.enter-wordmark .w-n,.enter-wordmark .w-o2{background:linear-gradient(180deg,#e4e8e9 0%,#aeb9c0 44%,#65747e 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;text-shadow:0 1px 0 rgba(255,255,255,.18),0 2px 0 rgba(28,39,46,.82),0 8px 18px rgba(0,0,0,.38)}.enter-wordmark .w-n:after,.enter-wordmark .w-o2:after{-webkit-text-stroke:.35px rgba(191,220,235,.34)}.enter-wordmark .w-n{margin-right:.035em}.enter-orbit{border-color:rgba(123,177,205,.28);box-shadow:inset 0 0 7px rgba(88,155,190,.05)}.enter-orbit-signal{animation:orbit-signal-spin 7.2s linear infinite;opacity:.42}.enter-orbit-signal:before{background:#dff6ff;box-shadow:0 0 5px rgba(220,246,255,.9),0 0 11px rgba(87,167,208,.38)}.enter-orbit-pulse{background:#ccefff;animation:blue-node-rest 7.2s ease-in-out infinite}.enter-wordmark.is-loading .enter-orbit-signal{animation-duration:1.65s;opacity:.82}.enter-wordmark.is-loading .enter-orbit-signal:before{box-shadow:0 0 6px #eefbff,0 0 15px rgba(104,190,233,.7),0 0 28px rgba(65,142,187,.32)}.enter-wordmark.is-loading .enter-orbit-pulse{animation:blue-node-loading 1.65s ease-in-out infinite}@keyframes blue-node-rest{0%,72%,100%{opacity:.38;box-shadow:0 0 5px rgba(109,179,214,.35);transform:scale(.8)}86%{opacity:.82;box-shadow:0 0 10px rgba(204,239,255,.68),0 0 18px rgba(77,152,194,.22);transform:scale(1)}}@keyframes blue-node-loading{0%,100%{opacity:.65;box-shadow:0 0 8px rgba(156,218,247,.58);transform:scale(.85)}50%{opacity:1;box-shadow:0 0 13px #eafaff,0 0 25px rgba(88,181,227,.52);transform:scale(1.08)}}
        /* Final O orbital model: one tilted 3D plane, split at the letter for real occlusion. */
        .enter-master-lockup{perspective:900px}.enter-master-lockup .enter-realistic-wordmark{clip-path:polygon(0 0,73% 0,73% 100%,0 100%)}.enter-final-o-image{position:absolute;z-index:2;right:6.65%;top:10.2%;width:20.1%;height:auto;filter:drop-shadow(-3px 7px 5px rgba(0,0,0,.62)) drop-shadow(0 0 2px rgba(255,224,135,.28))}.enter-orbit-depth{right:-.15%;top:5.5%;width:29.25%;height:85%;transform:rotateZ(-13deg) rotateX(62deg);transform-origin:50% 50%;transform-style:preserve-3d}.enter-orbit-depth.back{clip-path:inset(0 0 50% 0);opacity:.34}.enter-orbit-depth.front{clip-path:inset(50% 0 0 0)}.enter-orbit-depth:after{display:block;border:1.25px solid rgba(235,185,75,.78);box-shadow:inset 0 0 2px rgba(255,248,204,.52),0 0 4px rgba(121,72,10,.3)}.enter-orbit-depth.back:after{border-color:rgba(114,72,20,.48);filter:brightness(.7)}.enter-orbit-depth.front:after{border-color:rgba(255,220,130,.92)}.enter-orbit-planet:before{top:-2.7%;width:5.4%;transform:translateZ(8px) scaleY(2.12);background:radial-gradient(circle at 31% 25%,#fff8d3 0 7%,#f3cb68 17%,#bd7d24 48%,#5a310c 72%,#190b02 100%);border:1px solid rgba(255,223,143,.78);box-shadow:-2px 3px 5px rgba(0,0,0,.62),0 0 6px rgba(255,235,171,.7),0 0 16px rgba(213,147,31,.46)}.enter-orbit-depth.back .enter-orbit-planet:before{opacity:.42;filter:brightness(.5);box-shadow:0 0 3px rgba(170,108,20,.18)}
        .enter-mode{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin-bottom:22px;border:1px solid #202020;border-radius:12px;background:#0b0b0b}.enter-mode button{border:0;border-radius:8px;padding:10px;background:transparent;color:#666;font-size:11px;font-weight:650;cursor:pointer;transition:.18s}.enter-mode button.active{background:#191919;color:#f0ede8;box-shadow:0 1px 5px rgba(0,0,0,.35)}
        .enter-master-lockup{position:relative;width:min(88%,900px);isolation:isolate}.enter-master-lockup .enter-realistic-wordmark{width:100%;height:auto;object-fit:contain;filter:drop-shadow(0 18px 30px rgba(0,0,0,.48));position:relative;z-index:2}.enter-solar-motion{position:absolute;z-index:3;left:1.6%;top:10.5%;width:23.4%;aspect-ratio:1;border-radius:50%;pointer-events:none;overflow:hidden}.enter-solar-motion:before{content:'';position:absolute;inset:7.5%;border-radius:50%;background:conic-gradient(from 0deg,transparent 0 72%,rgba(255,238,174,0) 78%,rgba(255,238,174,.72) 88%,transparent 96%);-webkit-mask:radial-gradient(circle,transparent 0 39%,#000 42% 48%,transparent 51%);mask:radial-gradient(circle,transparent 0 39%,#000 42% 48%,transparent 51%);animation:enter-solar-sweep 7.8s cubic-bezier(.45,.05,.55,.95) infinite}.enter-solar-motion:after{content:'';position:absolute;inset:45%;border-radius:50%;background:#f7d77f;box-shadow:0 0 8px rgba(255,224,145,.85),0 0 25px rgba(215,153,43,.4);animation:enter-solar-breathe 4.8s ease-in-out infinite}.enter-orbit-depth{position:absolute;right:.6%;top:7%;width:28%;height:82%;pointer-events:none;transform:rotate(-13deg) scaleY(.55)}.enter-orbit-depth.back{z-index:1;clip-path:inset(0 0 49% 0);opacity:.28}.enter-orbit-depth.front{z-index:4;clip-path:inset(49% 0 0 0)}.enter-orbit-depth:after{content:'';position:absolute;inset:0;border-radius:50%;border:1px solid rgba(244,211,127,.2)}.enter-orbit-planet{position:absolute;inset:0;border-radius:50%;animation:enter-orbit-circuit 15.5s linear infinite}.enter-orbit-planet:before{content:'';position:absolute;left:47.8%;top:-2.2%;width:4.4%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 34% 28%,#fff4c6 0 9%,#e9bd55 25%,#9a641b 62%,#2f1907 100%);border:1px solid rgba(255,221,139,.72);box-shadow:0 0 5px rgba(255,236,177,.78),0 0 13px rgba(211,151,39,.55);transform:scaleY(1.82);animation:enter-planet-glint 15.5s ease-in-out infinite}.enter-orbit-depth.back .enter-orbit-planet:before{filter:brightness(.42);box-shadow:0 0 4px rgba(181,129,37,.22)}.enter-master-lockup.is-loading .enter-solar-motion:before{animation-duration:1.7s}.enter-master-lockup.is-loading .enter-orbit-planet{animation-duration:3.6s}.enter-master-lockup.is-loading .enter-orbit-planet:before{animation-duration:3.6s}.enter-master-lockup.is-loading .enter-solar-motion:after{animation-duration:1.25s}@keyframes enter-solar-sweep{0%{transform:rotate(0deg);opacity:.42}45%{opacity:.72}100%{transform:rotate(-360deg);opacity:.42}}@keyframes enter-solar-breathe{0%,100%{opacity:.36;transform:scale(.86)}50%{opacity:.82;transform:scale(1.08)}}@keyframes enter-orbit-circuit{to{transform:rotate(360deg)}}@keyframes enter-planet-glint{0%,76%,100%{filter:brightness(.88);box-shadow:0 0 4px rgba(255,236,177,.52),0 0 10px rgba(211,151,39,.38)}86%{filter:brightness(1.55);box-shadow:0 0 8px #fff2b8,0 0 20px rgba(222,161,44,.74)}}@media(prefers-reduced-motion:reduce){.enter-solar-motion:before,.enter-solar-motion:after,.enter-orbit-planet,.enter-orbit-planet:before{animation:none!important}.enter-orbit-planet{transform:rotate(42deg)}.enter-solar-motion:before{opacity:.5}}
        /* Final cascade: calibrated to the cleaned jewelry-grade O. */
        .enter-orbit-depth{right:2.05%;top:.8%;width:29.25%;height:85%;transform:rotateZ(-13deg) rotateX(62deg);transform-origin:50% 50%;transform-style:preserve-3d}.enter-orbit-depth.back{clip-path:inset(0 0 50% 0);opacity:.3}.enter-orbit-depth.front{clip-path:inset(50% 0 0 0)}.enter-orbit-depth:after{display:block;border:1.2px solid rgba(225,173,65,.76);box-shadow:inset 0 0 1px rgba(255,248,204,.55),0 0 3px rgba(117,67,8,.28)}.enter-orbit-depth.back:after{border-color:rgba(102,64,18,.46);filter:brightness(.66)}.enter-orbit-depth.front:after{border-color:rgba(255,218,123,.9);box-shadow:inset 0 0 1px rgba(255,255,225,.72),0 0 3px rgba(223,155,32,.22)}.enter-orbit-planet{animation-duration:17.2s}.enter-orbit-planet:before{top:-2.6%;width:5%;transform:translateZ(8px) scaleY(2.12);background:radial-gradient(circle at 31% 25%,#fff8d3 0 6%,#f1c762 17%,#b87521 49%,#53300d 73%,#170a02 100%);border:1px solid rgba(255,220,136,.74);box-shadow:-2px 3px 5px rgba(0,0,0,.6),0 0 5px rgba(255,232,163,.62),0 0 12px rgba(205,137,26,.38);animation-duration:17.2s}.enter-orbit-depth.back .enter-orbit-planet:before{opacity:.38;filter:brightness(.46);box-shadow:0 0 2px rgba(159,99,17,.16)}.enter-master-lockup.is-loading .enter-orbit-planet,.enter-master-lockup.is-loading .enter-orbit-planet:before{animation-duration:4.1s}@keyframes enter-planet-glint{0%,78%,100%{filter:brightness(.9);box-shadow:-2px 3px 5px rgba(0,0,0,.6),0 0 4px rgba(255,232,163,.48),0 0 10px rgba(205,137,26,.3)}88%{filter:brightness(1.38);box-shadow:-2px 3px 5px rgba(0,0,0,.55),0 0 7px rgba(255,245,199,.82),0 0 16px rgba(218,152,34,.54)}}
        .enter-orbit-planet-stage{position:absolute;z-index:4;right:2.05%;top:.8%;width:29.25%;height:85%;pointer-events:none;transform:rotateZ(-13deg) rotateX(62deg);transform-origin:50% 50%;transform-style:preserve-3d}.enter-orbit-planet:before{top:-3.6%;width:7%;background-image:radial-gradient(circle at 29% 23%,#fffbe4 0 7%,#f5cf6c 18%,#b87521 48%,#51300d 72%,#150902 100%),linear-gradient(90deg,transparent 0 24%,rgba(255,231,157,.22) 38%,rgba(46,22,4,.3) 52%,transparent 68%);background-size:100% 100%,220% 100%;background-blend-mode:screen;animation-name:enter-planet-glint,enter-planet-self-spin;animation-duration:17.2s,6.8s;animation-timing-function:ease-in-out,linear;animation-iteration-count:infinite;box-shadow:-2px 3px 5px rgba(0,0,0,.62),0 0 7px rgba(255,235,174,.7),0 0 15px rgba(206,139,27,.44)}.enter-master-lockup.is-loading .enter-orbit-planet:before{animation-duration:4.1s,1.8s}@keyframes enter-planet-self-spin{to{background-position:0 0,-220% 0}}@media(prefers-reduced-motion:reduce){.enter-orbit-planet-stage{animation:none!important}}
        /* Optical composition: one shared centre controls the final O, ring and planet. */
        .enter-master-lockup{--final-o-right:3.625%;--final-o-top:3.2%;--final-o-width:26.9%;--orbit-right:3.075%;--orbit-top:-2.45%;--orbit-width:28%;--orbit-height:100%;width:min(84%,860px);transform:translateX(-.6%)}
        .enter-final-o-image{right:var(--final-o-right);top:var(--final-o-top);width:var(--final-o-width)}
        .enter-orbit-depth,.enter-orbit-planet-stage{right:var(--orbit-right);top:var(--orbit-top);width:var(--orbit-width);height:var(--orbit-height);transform:rotate(-13deg) scaleY(.58);transform-origin:50% 50%}
        .enter-orbit-depth:after{inset:0;box-sizing:border-box;border-width:1.15px;border-radius:50%}
        .enter-orbit-depth.back{clip-path:inset(0 0 50% 0)}
        .enter-orbit-depth.front{clip-path:inset(50% 0 0 0)}
        .enter-orbit-planet:before{left:50%;top:-3.5%;width:6.8%;transform:translateX(-50%) scaleY(1.72)}
      `}</style>
      <section className="login-brand-panel" style={{ position: 'relative', overflow: 'hidden', background: '#020101' }} aria-label="OIANO artist workspace">
        <AdaptiveUniverse intensified={focused} />
        <div className="enter-brand-copy">
          <div className={loading ? 'enter-master-lockup is-loading' : 'enter-master-lockup'}>
            <img
              src="/brand/oiano-wordmark-master-v7.png"
              alt="Oiano"
              className="enter-realistic-wordmark"
            />
            <span className="enter-solar-motion" aria-hidden="true" />
            <img className="enter-final-o-image" src="/brand/oiano-final-o-master-v6.png" alt="" aria-hidden="true" />
            <span className="enter-orbit-depth back" aria-hidden="true" />
            <span className="enter-orbit-depth front" aria-hidden="true" />
            <span className="enter-orbit-planet-stage" aria-hidden="true"><span className="enter-orbit-planet" /></span>
          </div>
          <div className="enter-wordmark-ground" />
          <div className="enter-wordmark-rule" />
          <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'clamp(.52rem,1.1vw,.68rem)',letterSpacing:'.28em',color:'rgba(201,168,76,.4)',textTransform:'uppercase',margin:'16px 0 0'}}>Studio access · Artist identity · Creative work</p>
        </div>
        <div className="enter-trust">
          <div className="enter-trust-item"><CalendarDays size={15} color="#C9A84C"/><strong>Create together</strong><span>Find the right studio, room and creative team.</span></div>
          <div className="enter-trust-item"><ShieldCheck size={15} color="#C9A84C"/><strong>Your work stays yours</strong><span>Private projects and controlled sharing.</span></div>
          <div className="enter-trust-item"><Sparkles size={15} color="#C9A84C"/><strong>Build your identity</strong><span>A professional Passport that grows with you.</span></div>
        </div>
        {converging && <div className="enter-converge-flash" />}
      </section>

      <section className="login-form-panel">
        <div className="login-form-inner">
          <div className="enter-mobile-brand" style={{marginBottom:42}}><OianoBrand variant="compact" size={27}/></div>
          <header style={{marginBottom:28}}>
            <p style={{fontFamily:"'JetBrains Mono',monospace",fontSize:9,letterSpacing:'.22em',color:'#5a5a60',textTransform:'uppercase',marginBottom:12}}>{returningToBooking ? 'Continue your booking' : 'Secure access portal'}</p>
            <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:600,color:'#f0ede8',letterSpacing:'-.01em',lineHeight:1.18,margin:0}}>{mfa ? <>Protecting OIANO<br/>starts here</> : returningToBooking ? <>Your session is<br/>waiting</> : <>Welcome back<br/>to your work</>}</h1>
            <p style={{color:'#707070',fontSize:12,lineHeight:1.6,margin:'12px 0 0'}}>{mfa ? (mfa.setup?'Add this account to your authenticator app, then enter the current six-digit code.':'Enter the current code from your authenticator app.') : returningToBooking ? 'Sign in and return directly to your studio selection.' : 'One account for sessions, projects and your professional artist identity.'}</p>
          </header>
          {mfa ? <>
            {mfa.setup&&<div style={{padding:14,border:'1px solid #272727',borderRadius:11,background:'#0d0d0d',marginBottom:16}}><p style={{fontSize:9,color:'#666',textTransform:'uppercase',letterSpacing:'.12em',margin:'0 0 8px'}}>Authenticator setup key</p><code style={{fontSize:13,color:'#C9A84C',wordBreak:'break-all',letterSpacing:'.08em'}}>{mfa.secret}</code><p style={{fontSize:9,color:'#444',lineHeight:1.5,margin:'9px 0 0'}}>In Google Authenticator, Microsoft Authenticator or 1Password, choose “enter setup key”.</p></div>}
            {error&&<div role="alert" style={{background:'#1a0808',border:'1px solid #3a1010',color:'#f87171',fontSize:12,padding:'11px 14px',borderRadius:9,marginBottom:16}}>{error}</div>}
            <form onSubmit={e=>{e.preventDefault();if(mfaCode.length===6&&!loading)handleMfa()}}><div className="enter-field"><label htmlFor="mfa-code">Six-digit authenticator code</label><input id="mfa-code" className="enter-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} autoFocus value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,''))} placeholder="000000" style={{textAlign:'center',letterSpacing:'.45em',fontSize:19}} required/></div><button type="submit" className="enter-submit" style={{marginTop:18}} disabled={loading||mfaCode.length!==6}>{loading?'Verifying…':mfa.setup?'Enable MFA and enter':'Verify and enter'}<ArrowRight size={16}/></button></form><button type="button" onClick={()=>{setMfa(null);setMfaCode('');setError('')}} style={{display:'block',margin:'18px auto 0',border:0,background:'none',color:'#555',fontSize:10,cursor:'pointer'}}>Back to sign in</button>
          </> : <>
          <div className="enter-mode" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setError(''); }}>Create account</button>
          </div>
          {error && <div role="alert" aria-live="polite" style={{background:'#1a0808',border:'1px solid #3a1010',color:'#f87171',fontSize:12,padding:'11px 14px',borderRadius:9,marginBottom:20}}>{error}</div>}
          <form onSubmit={(event) => { event.preventDefault(); if (!loading && email && password) handleEnter(); }}>
            <div style={{display:'flex',flexDirection:'column',gap:15,marginBottom:20}}>
              <div className="enter-field"><label htmlFor="enter-email">Email address</label><input id="enter-email" className="enter-input" type="email" placeholder="you@example.com" value={email} autoComplete="email" required onChange={(event)=>setEmail(event.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}/></div>
              <div className="enter-field"><label htmlFor="enter-password">Password</label><input id="enter-password" className="enter-input" style={{paddingRight:48}} type={showPassword?'text':'password'} placeholder={mode === 'signup' ? 'At least 8 characters' : 'Your password'} value={password} minLength={mode === 'signup' ? 8 : undefined} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} onChange={(event)=>setPassword(event.target.value)} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}/><button type="button" className="enter-eye" onClick={()=>setShowPassword(value=>!value)} aria-label={showPassword?'Hide password':'Show password'}>{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button></div>
            </div>
            <button type="submit" className="enter-submit" disabled={loading||!email||!password||(mode === 'signup' && password.length < 8)}>{loading?<span className="animate-pulse">Preparing your workspace…</span>:<>{mode === 'signup' ? (returningToBooking ? 'Create account and continue' : 'Create artist account') : (returningToBooking ? 'Sign in and continue' : 'Sign in')}<ArrowRight size={16}/></>}</button>
          </form>
          <div className="enter-status"><Check size={13} color="#79966f" style={{marginTop:1,flexShrink:0}}/><span>{mode === 'signup' ? 'Your artist account includes a professional Passport and secure project workspace.' : 'Use the email and password connected to your OIANO account.'}</span></div>
          <p style={{margin:'24px 0 0',color:'#3f3f46',fontSize:9,lineHeight:1.6,textAlign:'center'}}>By continuing, you agree to keep your account credentials private.</p>
          </>}
        </div>
      </section>
    </main>
  );
}
