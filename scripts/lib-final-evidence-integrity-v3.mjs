import crypto from 'node:crypto';

export function evidenceSha256(record={}){
  const copy={...record};
  delete copy.evidenceSha256;
  return crypto.createHash('sha256').update(JSON.stringify(copy)).digest('hex');
}

export function evidenceIntegrityStatus(record){
  if(!record)return {ok:false,status:'NOT_RUN',reason:'evidence missing'};
  const actual=String(record.evidenceSha256||'');
  if(!/^[0-9a-f]{64}$/i.test(actual))return {ok:false,status:'STALE',reason:'evidenceSha256 missing or invalid'};
  const expected=evidenceSha256(record);
  if(expected!==actual)return {ok:false,status:'FAILED',reason:'evidenceSha256 mismatch'};
  return {ok:true,status:'READY',reason:'evidenceSha256 verified'};
}
