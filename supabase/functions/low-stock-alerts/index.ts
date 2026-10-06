import { createClient } from 'npm:@supabase/supabase-js@2';
import { firebaseAccessToken } from '../_shared/fcm.ts';
Deno.serve(async req=>{
  if(!Deno.env.get('ALERTS_CRON_SECRET')||req.headers.get('Authorization')!==`Bearer ${Deno.env.get('ALERTS_CRON_SECRET')}`)return Response.json({error:'Unauthorized'},{status:401});
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try{
    const {data:items,error}=await client.from('items').select('*,catalog_items(name)');if(error)throw error;
    let sent=0,failed=0;const resend=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('ALERT_EMAIL_FROM');const account=Deno.env.get('FIREBASE_SERVICE_ACCOUNT')?JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')!):null;const googleToken=account?await firebaseAccessToken(account):null;
    for(const item of items??[]){
      if(item.archived_at||item.quantity>=item.low_stock_threshold){const {error:resetError}=await client.from('low_stock_deliveries').delete().eq('item_id',item.id);if(resetError)throw resetError;continue;}
      const [{data:profiles,error:profileError},{data:tokens,error:tokenError}]=await Promise.all([client.from('profiles').select('email,name').eq('company_id',item.company_id),client.from('push_tokens').select('token,platform').eq('company_id',item.company_id)]);if(profileError)throw profileError;if(tokenError)throw tokenError;
      const recipients=[...(resend&&from?(profiles??[]).map(p=>({recipient:p.email,channel:'email',name:p.name})):[]),...(account?(tokens??[]).map(t=>({recipient:t.token,channel:'push',name:'there'})):[])];
      for(const target of recipients){
        const {data:prior,error:priorError}=await client.from('low_stock_deliveries').select('id').eq('item_id',item.id).eq('recipient',target.recipient).eq('channel',target.channel).maybeSingle();if(priorError)throw priorError;if(prior)continue;
        // Claim before delivery so overlapping scheduled runs cannot duplicate alerts.
        const {data:claim,error:claimError}=await client.from('low_stock_deliveries').insert({company_id:item.company_id,item_id:item.id,recipient:target.recipient,channel:target.channel}).select('id').single();if(claimError){if(claimError.code==='23505')continue;throw claimError;}
        const message=`Hello, ${target.name}. ${item.catalog_items.name} is running low: ${item.quantity} in stock (alert below ${item.low_stock_threshold}).`;
        try{const response=target.channel==='email'?await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resend}`,'Content-Type':'application/json','Idempotency-Key':claim.id},body:JSON.stringify({from,to:target.recipient,subject:'A little Stocket heads-up',text:message})}):await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${googleToken}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token:target.recipient,notification:{title:'Time for a top-up?',body:message},data:{item_id:item.id},android:{notification:{channel_id:'stock-alerts'}}}})});if(!response.ok)throw new Error('Delivery failed');sent++;}catch{await client.from('low_stock_deliveries').delete().eq('id',claim.id);failed++;}
      }
    }
    return Response.json({sent,failed},{status:failed?207:200});
  }catch(e){return Response.json({error:(e as Error).message},{status:500});}
});
