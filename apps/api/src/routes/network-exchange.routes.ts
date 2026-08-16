import { Router, NextFunction, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth.middleware';

export const networkExchangeRouter=Router();
networkExchangeRouter.use(authenticate);

networkExchangeRouter.get('/',async(req:any,res:Response,next:NextFunction)=>{
  try{
    const role=req.userRole;
    if(role==='STUDIO_ADMIN'){
      const staff=await prisma.studioStaff.findUnique({where:{user_id:req.userId},include:{studio:true}});
      if(!staff)return res.status(403).json({error:'Forbidden'});
      const since=new Date(Date.now()-30*86400000);
      const artists=await prisma.artist.findMany({where:{status:'AVAILABLE_FOR_BOOKING'},select:{created_at:true,passport:{select:{creative_dna:true,location:true,profile_strength:true}}}});
      const recentBookings=await prisma.booking.findMany({where:{studio_id:staff.studio_id,created_at:{gte:since}},select:{artist_id:true,starts_at:true,service:{select:{name:true}},artist:{select:{passport:{select:{creative_dna:true}}}}}});
      const availableGenres:Record<string,number>={},bookedGenres:Record<string,number>={},services:Record<string,number>={};
      for(const a of artists){const dna=(a.passport?.creative_dna as any)??{};for(const genre of Array.isArray(dna.genres)?dna.genres:[])availableGenres[genre]=(availableGenres[genre]??0)+1}
      for(const b of recentBookings){services[b.service.name]=(services[b.service.name]??0)+1;const dna=(b.artist.passport?.creative_dna as any)??{};for(const genre of Array.isArray(dna.genres)?dna.genres:[])bookedGenres[genre]=(bookedGenres[genre]??0)+1;}
      const ranked=(o:Record<string,number>)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([label,count])=>({label,count}));
      return res.json({mode:'STUDIO',market:{available_artists:artists.length,new_artists_30d:artists.filter(a=>a.created_at>=since).length,qualified_profiles:artists.filter(a=>(a.passport?.profile_strength??0)>=60).length,unique_artists_30d:new Set(recentBookings.map(b=>b.artist_id)).size},available_genres:ranked(availableGenres),booked_genres:ranked(bookedGenres),booked_services:ranked(services),signal_window_days:30,privacy:'Aggregated network availability and completed booking activity. Artist identities remain private until they engage.'});
    }
    if(role==='ARTIST'){
      const studios=await prisma.studio.findMany({include:{rooms:true,services:true,bookings:{where:{created_at:{gte:new Date(Date.now()-30*86400000)}},select:{id:true,artist_id:true}}}});
      return res.json({mode:'ARTIST',studios:studios.map(s=>({id:s.id,slug:s.slug,name:s.name,address:s.address,currency:s.currency,rooms:s.rooms.length,services:s.services.slice(0,4).map(v=>v.name),starting_from:s.services.length?Math.min(...s.services.map(v=>Number(v.min_price_usd))):null,artists_30d:new Set(s.bookings.map(b=>b.artist_id)).size,open_hour:s.operating_open_hour,close_hour:s.operating_close_hour})).sort((a,b)=>b.artists_30d-a.artists_30d)});
    }
    return res.status(403).json({error:'Exchange unavailable for this role'});
  }catch(error){next(error)}
});
