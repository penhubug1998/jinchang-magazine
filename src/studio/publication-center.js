export const PUBLICATION_CENTER_INFO=Object.freeze({versionSource:'runtime:/api/health',name:'Publishing Center 2.0',outputs:['web','pdf','archive'],sourceOfTruth:'issue.json'});
export function metricTone(value,{pass=95,warn=80}={}){const n=Number(value)||0;return n>=pass?'pass':n>=warn?'warn':'fail';}
export function deviceLabel(value){return value==='pass'?'PASS':value==='fail'?'FAIL':'待检查';}
export function publicationReadinessLabel(status){if(status?.forceRelease)return 'FORCE 模式 · 已跳过全部发布门禁';if(status?.canPublish&&status?.formalReady===false)return '严格门禁通过 · 设备待验收（提示）';if(status?.canPublish)return '严格门禁通过 · 可以正式发布';if(status?.audit?.blockers)return `严格门禁阻断 ${status.audit.blockers} 项`;return '尚未满足正式发布条件';}
export function publicationOutputLabel(kind){return ({web:'Web Reader',pdf:'Print PDF',archive:'Archive ZIP',release:'正式发布包'})[kind]||kind;}
