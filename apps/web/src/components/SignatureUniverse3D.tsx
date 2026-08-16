import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Stars } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

function World({intensified,reduced}:{intensified:boolean;reduced:boolean}){
  const globe=useRef<THREE.Group>(null),orbit=useRef<THREE.Points>(null);
  const particles=useMemo(()=>{const count=reduced?120:420,a=new Float32Array(count*3);for(let i=0;i<count;i++){const angle=Math.random()*Math.PI*2,r=3.3+Math.random()*1.8;a[i*3]=Math.cos(angle)*r;a[i*3+1]=(Math.random()-.5)*1.2;a[i*3+2]=Math.sin(angle)*r;}return a},[reduced]);
  useFrame((_,delta)=>{if(reduced)return;if(globe.current)globe.current.rotation.y+=delta*(intensified?.11:.055);if(orbit.current)orbit.current.rotation.y-=delta*(intensified?.18:.07)});
  return <group position={[0,-3.4,0]}>
    <ambientLight intensity={.14}/>
    <pointLight position={[1.5,3.2,3]} color="#ffd778" intensity={intensified?95:62} distance={12}/>
    <pointLight position={[-4,1,-2]} color="#5A9BCB" intensity={22} distance={10}/>
    <group ref={globe}>
      <mesh><sphereGeometry args={[4.8,96,96]}/><meshStandardMaterial color="#080502" roughness={.72} metalness={.25}/></mesh>
      <mesh scale={1.012}><sphereGeometry args={[4.8,96,96]}/><meshBasicMaterial color="#d79b36" transparent opacity={.035} side={THREE.BackSide}/></mesh>
      <mesh rotation={[Math.PI/2.18,0,0]}><torusGeometry args={[4.82,.022,10,180]}/><meshBasicMaterial color="#ffe29a" toneMapped={false}/></mesh>
    </group>
    <points ref={orbit} position={[0,4.2,0]}><bufferGeometry><bufferAttribute attach="attributes-position" args={[particles,3]}/></bufferGeometry><pointsMaterial color={intensified?'#ffe6a4':'#c9a84c'} size={intensified?.035:.022} transparent opacity={intensified?.9:.58} sizeAttenuation/></points>
  </group>
}

export default function SignatureUniverse3D({intensified=false}:{intensified?:boolean}){
  const reduced=typeof window!=='undefined'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <div className="absolute inset-0" aria-hidden="true">
    <Canvas dpr={[1,1.6]} camera={{position:[0,0,9],fov:42}} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} fallback={<div className="absolute inset-0 bg-black"/>}>
      <color attach="background" args={['#010102']}/>
      <fog attach="fog" args={['#010102',7,18]}/>
      <Stars radius={45} depth={28} count={reduced?280:900} factor={1.4} saturation={.32} fade speed={reduced?0:.18}/>
      <Float speed={reduced?0:.35} rotationIntensity={reduced?0:.06} floatIntensity={reduced?0:.12}><World intensified={intensified} reduced={reduced}/></Float>
    </Canvas>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_78%,rgba(201,168,76,.12),transparent_34%),linear-gradient(180deg,transparent_52%,rgba(0,0,0,.55))]"/>
  </div>
}
