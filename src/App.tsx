
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './apiClient';
import { Icon } from '@iconify/react';
import fatirCompanyLogo from './assets/fatir-logo.svg';

declare global {
  interface Window {
    Telegram?: { WebApp?: {
      initData: string;
      ready():void;
      expand():void;
      colorScheme?:string;
      HapticFeedback?: { impactOccurred(type:string):void; notificationOccurred(type:string):void };
    } };
  }
}

type User = {id:string; name:string; role:string};
type Product = {code:string;name:string;weight:number;unit:string;aliases?:string[]};
type Client = {code:string;name:string;region:string;city:string;active:boolean};
type Line = {key:string; itemId?:string; productCode:string; quantity:number;plant:string};
type Order = {
  orderId:string; clientId:string;clientName:string;status:string;reviewReason:string;
  region:string;city:string;address:string;deliveryDate:string;deliveryType:string;
  sourceText:string;totalBags:number;totalWeightKg:number;version:number;
  updatedAt:string;requesterId:string;logisticId:string;
};
type OrderLine = {itemId:string;productCode:string;productName:string;quantity:number;plant:string;unitWeight:number;totalWeightKg?:number;matchStatus?:string};
type RecordEvent = {
 id:string;kind:string;createdAt:string;actorId:string;actorName:string;role:string;
 text:string;status?:string;reason?:string;items?:OrderLine[];decidedBy?:string;decisionNote?:string;decidedAt?:string;
 baseVersion?:number;auditSynced?:boolean;v2?:boolean;
};
type Detail = {order:Order;items:OrderLine[];timeline:RecordEvent[];canEdit:boolean;isRequester:boolean};
type Result = {pending?:boolean;requestId?:string;orderId?:string;clientId?:string;status?:string;requiresReview?:boolean};
const PLANTS=[{code:'PL-AGR',name:'Агро'},{code:'PL-ALN',name:'Альянс'},{code:'PL-GLS',name:'Гулистан'}];
const REGIONS=['Согдийская область','Душанбе','Хатлонская область','ГБАО'];
const statuses:Record<string,{label:string;className:string}>={
  DRAFT:{label:'Новая',className:'draft'},
  NEEDS_REVIEW:{label:'Требует проверки',className:'attention'},
  DISCUSSION:{label:'Обсуждение',className:'discussion'},
  CONFIRMED:{label:'Подтверждена',className:'confirmed'},
  REJECTED:{label:'Отклонена',className:'danger'},
  APPLIED:{label:'Применено',className:'confirmed'},
  CANCELLED:{label:'Отменена',className:'danger'},
};
const key=()=>crypto.randomUUID().replaceAll('-','');
const firstLine=():Line=>({key:key(),productCode:'',quantity:1,plant:''});
const stored=(name:string)=>{try{return sessionStorage.getItem(name)||''}catch{return ''}};
const remember=(name:string,val:string|null)=>{try{val===null?sessionStorage.removeItem(name):sessionStorage.setItem(name,val)}catch{}};
const currentTjDate=()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dushanbe',day:'2-digit',month:'2-digit',year:'numeric'}).formatToParts(new Date());const part=(x:string)=>p.find(i=>i.type===x)?.value||'';return part('year')+'-'+part('month')+'-'+part('day')};
const plantName=(id:string)=>PLANTS.find(p=>p.code===id)?.name||'Не выбран';
const fmt=(v:number)=>Number(v||0).toLocaleString('ru-RU');
const fmtTime=(iso:string)=>{try{return new Date(iso).toLocaleString('ru-RU',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Dushanbe'})}catch{return iso}};
const ico=(name:string,size=20)=><Icon icon={'solar:'+name} width={size} height={size} aria-hidden="true" />;
function Status({value}:{value:string}){const s=statuses[value]||{label:value||'Неизвестно',className:'draft'};return <span className={'status status-'+s.className}><span className="status-dot"/>{s.label}</span>}
function Warning({children}:{children:React.ReactNode}){return <div className="warning">{ico('danger-circle-linear',18)} <span>{children}</span></div>}
const canDiscuss=(status:string)=>status==='DISCUSSION';
function Pill({icon,text}:{icon:string;text:string}){return <span className="pill">{ico(icon,16)}{text}</span>}

export default function App(){
  const [auth,setAuth]=useState<'checking'|'ready'|'denied'>('checking');
  const [authMessage,setAuthMessage]=useState('');
  const [user,setUser]=useState<User|null>(null);
  const [products,setProducts]=useState<Product[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [view,setView]=useState<'new'|'inbox'>('new');
  const [clientId,setClientId]=useState('');
  const [clientName,setClientName]=useState('');
  const [region,setRegion]=useState(REGIONS[0]);
  const [city,setCity]=useState('');
  const [address,setAddress]=useState('');
  const [deliveryDate,setDeliveryDate]=useState(currentTjDate);
  const [deliveryType,setDeliveryType]=useState<'Самовывоз'|'Доставка'>('Самовывоз');
  const [notes,setNotes]=useState('');
  const [lines,setLines]=useState<Line[]>([firstLine()]);
  const [requestId,setRequestId]=useState(()=>stored('fatir.pending')||key());
  const [result,setResult]=useState<Result|null>(()=>stored('fatir.pending')?{pending:true,requestId:stored('fatir.pending')}:null);
  const [busy,setBusy]=useState(false);
  const [errorText,setErrorText]=useState('');
  const [pollError,setPollError]=useState('');
  const [orders,setOrders]=useState<Order[]>([]);
  const [orderSearch,setOrderSearch]=useState('');
  const [filter,setFilter]=useState('ALL');
  const [selected,setSelected]=useState('');
  const [detail,setDetail]=useState<Detail|null>(null);
  const [listBusy,setListBusy]=useState(false);
  const [queueRefreshedAt,setQueueRefreshedAt]=useState<Date|null>(null);
  const [queueAutoRefresh,setQueueAutoRefresh]=useState(true);
  const [detailBusy,setDetailBusy]=useState(false);
  const [discussionError,setDiscussionError]=useState('');
  const [discussionMessage,setDiscussionMessage]=useState('');
  const [commentText,setCommentText]=useState('');
  const [commentKind,setCommentKind]=useState<'QUESTION'|'NOTE'>('QUESTION');
  const [proposalOpen,setProposalOpen]=useState(false);
  const [draftLines,setDraftLines]=useState<Line[]>([]);
  const [proposalReason,setProposalReason]=useState('');
  const [actionBusy,setActionBusy]=useState(false);
  const [auditBusy,setAuditBusy]=useState(false);
  const [auditOffset,setAuditOffset]=useState(0);
  const [applyTarget,setApplyTarget]=useState<RecordEvent|null>(null);
  const initData=window.Telegram?.WebApp?.initData||'';
  const isLogist=['admin','logistic'].includes(user?.role||'');
  const haptic=()=>window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
  const post=useCallback(async(path:string,payload:Record<string,unknown>={})=>{
    const res=await api.post(path,{...payload,initData});
    return res.data;
  },[initData]);
  const postV2=useCallback(async(payload:Record<string,unknown>,apply=false)=>{
    const endpoint=apply?'https://fatir-agro.app.n8n.cloud/webhook/fatir-discussion-v2-apply-20261105-QSp8D4NvK7':'https://fatir-agro.app.n8n.cloud/webhook/fatir-discussion-v2-20261105-Ny3J3Az2eLo5s4QbF68';
    const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({...payload,initData})});
    const data=await response.json().catch(()=>({ok:false,error:'Некорректный ответ n8n'}));
    if(!response.ok||!data?.ok)throw new Error(data?.error||'Не удалось выполнить запрос изменений');
    return data;
  },[initData]);
  useEffect(()=>{
    const tg=window.Telegram?.WebApp;
    if(!tg?.initData){setAuth('denied');setAuthMessage('Откройте Mini App через кнопку FATIR-бота в Telegram. Обычная ссылка не передаёт данные авторизации.');return}
    tg.ready();tg.expand();
    post('/api/bootstrap').then((d)=>{
      setUser(d.user);setProducts(d.products||[]);setClients(d.clients||[]);
      setAuth('ready');
      const q=new URLSearchParams(window.location.search);
      if(q.get('order')){setSelected(q.get('order')||'');setView('inbox')}
    }).catch((e)=>{
      setAuth('denied');
      setAuthMessage(e?.response?.data?.error||e?.message||'Не удалось проверить доступ');
    });
  },[post]);
  useEffect(()=>{
    if(auth!=='ready'||!result?.pending||!result.requestId)return;
    let active=true,wait:ReturnType<typeof setTimeout>,attempt=0;
    const poll=async()=>{
      try{
        const d=await post('/api/order-status',{requestId:result.requestId});
        if(!active)return;
        if(d.orderId&&!d.pending){
          remember('fatir.pending',null);setResult({...d,pending:false});setPollError('');return;
        }
        setPollError('');
      }catch{if(active)setPollError('Проверка ответа задерживается. Не отправляйте заказ повторно.')}
      if(active){attempt++;wait=setTimeout(poll,attempt<20?4000:10000)}
    };
    poll();return()=>{active=false;clearTimeout(wait)};
  },[auth,result?.pending,result?.requestId,post]);
  const loadOrders=useCallback(async()=>{
    setListBusy(true);setDiscussionError('');
    try{const d=await post('/api/discussions/list');setOrders(d.orders||[]);setQueueRefreshedAt(new Date())}
    catch(e:any){setDiscussionError(e?.response?.data?.error||e.message||'Не удалось загрузить очередь')}
    finally{setListBusy(false)}
  },[post]);
  const loadDetail=useCallback(async(id:string)=>{
    if(!id)return;
    setDetailBusy(true);setDiscussionError('');
    try{
      const d=await post('/api/discussions/get',{orderId:id});
      let extra:RecordEvent[]=[];
      try{const v2=await postV2({action:'list',orderId:id});extra=Array.isArray(v2.proposals)?v2.proposals:[]}
      catch{setDiscussionMessage('История структурных изменений временно недоступна. Попробуйте обновить карточку.');}
      setDetail({...d,timeline:[...(d.timeline||[]),...extra].sort((a:RecordEvent,b:RecordEvent)=>String(a.createdAt).localeCompare(String(b.createdAt)))});
      setSelected(id)
    }
    catch(e:any){setDiscussionError(e?.response?.data?.error||e.message||'Не удалось открыть заказ')}
    finally{setDetailBusy(false)}
  },[post,postV2]);
  useEffect(()=>{if(auth==='ready'&&view==='inbox')loadOrders()},[auth,view,loadOrders]);
  useEffect(()=>{if(auth==='ready'&&view==='inbox'&&selected)loadDetail(selected)},[auth,view,selected,loadDetail]);
  useEffect(()=>{
    if(auth!=='ready'||view!=='inbox'||!queueAutoRefresh)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=='visible')return;
      post('/api/discussions/list').then(d=>{setOrders(d.orders||[]);setQueueRefreshedAt(new Date())}).catch(()=>{});
    },45000);
    return ()=>window.clearInterval(timer);
  },[auth,view,queueAutoRefresh,post]);
  const totalBags=lines.reduce((sum,l)=>sum+(Number(l.quantity)||0),0);
  const totalWeight=lines.reduce((sum,l)=>sum+(products.find(p=>p.code===l.productCode)?.weight||0)*(Number(l.quantity)||0),0);
  const updateLine=(id:string,patch:Partial<Line>)=>setLines(arr=>arr.map(l=>l.key===id?{...l,...patch}:l));
  const submit=async()=>{
    haptic();setErrorText('');
    if(!clientId&&!clientName.trim()){setErrorText('Выберите клиента или заполните имя нового.');return}
    if(!city.trim()||!deliveryDate){setErrorText('Укажите город и дату отгрузки.');return}
    if(!lines.length||lines.some(x=>!x.productCode||!x.plant||!Number.isSafeInteger(Number(x.quantity))||x.quantity<1)){
      setErrorText('Проверьте товар, количество и завод для каждой позиции.');return;
    }
    setBusy(true);
    try{
      const d=await post('/api/orders',{requestId,clientId,clientName,region,city,address,deliveryDate,deliveryType,notes,
        items:lines.map(({productCode,quantity,plant})=>({productCode,quantity,plant}))});
      if(!d.accepted)throw Error('Сервер не подтвердил приём заявки');
      remember('fatir.pending',requestId);setResult({pending:true,requestId});
    }catch(e:any){setErrorText(e?.response?.data?.error||e?.message||'Не удалось сохранить заявку')}
    finally{setBusy(false)}
  };
  const reset=()=>{remember('fatir.pending',null);setResult(null);setClientId('');setClientName('');setCity('');setAddress('');setLines([firstLine()]);setNotes('');setDeliveryType('Самовывоз');setRequestId(key())};
  const statusPriority:Record<string,number>={DISCUSSION:0,NEEDS_REVIEW:1,DRAFT:2,CONFIRMED:3,REJECTED:4,CANCELLED:5,SHIPPED:6,COMPLETED:7};
  const queueCounts=useMemo(()=>({all:orders.length,discussion:orders.filter(o=>o.status==='DISCUSSION').length,review:orders.filter(o=>o.status==='NEEDS_REVIEW').length,new:orders.filter(o=>o.status==='DRAFT').length}),[orders]);
  const allFiltered=useMemo(()=>orders.filter(o=>(filter==='ALL'||o.status===filter)&&
    (o.orderId+' '+o.clientName+' '+o.city).toLowerCase().includes(orderSearch.toLowerCase()))
    .sort((a,b)=>(statusPriority[a.status]??8)-(statusPriority[b.status]??8)||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))),[orders,filter,orderSearch]);
  const postAction=async(endpoint:string,payload:Record<string,unknown>)=>{
    if(!selected)return;
    setActionBusy(true);setDiscussionError('');setDiscussionMessage('');
    try{
      const d=await post(endpoint,{...payload,orderId:selected,eventId:key()});
      setDiscussionMessage(d.duplicate?'Это действие уже сохранено.':d.auditSynced===false
        ?'Действие сохранено в FATIR. Запись в Google Sheets требует проверки синхронизации.':d.delivered===null
        ?'Внутренняя заметка сохранена без уведомления заявщика.':d.delivered===false
        ?'Изменение сохранено. Telegram не доставил уведомление адресату — уточните напрямую.'
        :'Сохранено. Уведомление отправлено в Telegram.');
      await loadDetail(selected);
      setCommentText('');setProposalOpen(false);setProposalReason('');
      await loadOrders();
      haptic();
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось сохранить действие')}
    finally{setActionBusy(false)}
  };
  const repairAudit=async()=>{
    if(!selected||!isLogist)return;
    setAuditBusy(true);setDiscussionError('');
    try {
      const d=await post('/api/discussions/repair-audit',{orderId:selected,offset:auditOffset});
      setAuditOffset(d.nextOffset===null?0:Number(d.nextOffset||0));
      setDiscussionMessage('Google Sheets: сверено '+d.repaired+' из '+d.processed+' событий.'+
        (d.failed?' Ошибок: '+d.failed+'. Повторите позже.':'')+
        (d.nextOffset===null?'':' Есть другие события — повторите сверку.'));
      await loadDetail(selected);
      haptic();
    }catch(e:any){
      setDiscussionError(e?.response?.data?.error||e?.message||'Синхронизация журнала недоступна');
    }finally{setAuditBusy(false)}
  };
  const applyApproved=async()=>{
    if(!applyTarget||!selected)return;
    setActionBusy(true);setDiscussionError('');setDiscussionMessage('');
    try{
      const d=applyTarget.v2
        ?await postV2({orderId:selected,proposalId:applyTarget.id},true)
        :await post('/api/discussions/apply',{orderId:selected,proposalId:applyTarget.id,eventId:key()});
      if(!d.ok)throw Error('Сервер не подтвердил применение корректировки');
      setApplyTarget(null);
      setDiscussionMessage('Корректировка применена к '+selected+'. Актуальный статус: '+d.status+'.'+(d.auditSynced===false?' Требуется проверка синхронизации журнала Google Sheets.':'')+(d.channelNotified===false?' Канал логистов не получил обновлённую карточку — уведомите логиста вручную.':''));
      await loadDetail(selected);await loadOrders();
      haptic();
    }catch(e:any){setDiscussionError(e?.response?.data?.error||e?.message||'Не удалось применить корректировку');setApplyTarget(null)}
    finally{setActionBusy(false)}
  };
  const decideV2=async(proposalId:string,approve:boolean)=>{
    if(!selected)return;
    setActionBusy(true);setDiscussionError('');
    try{
      await postV2({action:'decide',orderId:selected,proposalId,approve});
      setDiscussionMessage(approve?'Предложение согласовано. Ожидается отдельное применение логистом.':'Предложение отклонено без изменения ORD.');
      await loadDetail(selected);haptic();
    }catch(e:any){setDiscussionError(e?.message||'Не удалось сохранить решение')}
    finally{setActionBusy(false)}
  };
  const openProposal=()=>{
    if(!detail)return;
    setDraftLines(detail.items.map(x=>({key:key(),itemId:x.itemId,productCode:x.productCode,plant:x.plant||'',quantity:x.quantity})));
    setProposalReason('');setProposalOpen(true);setDiscussionError('');
  };
  const draftTotal=useMemo(()=>draftLines.reduce((sum,x)=>sum+(products.find(p=>p.code===x.productCode)?.weight||0)*Math.max(0,Number(x.quantity)||0),0),[draftLines,products]);
  const draftBagCount=useMemo(()=>draftLines.reduce((sum,x)=>sum+Math.max(0,Number(x.quantity)||0),0),[draftLines]);
  const submitProposal=async()=>{
    if(!selected||!detail)return;
    if(proposalReason.trim().length<5){setDiscussionError('Укажите причину изменений (не менее 5 символов).');return}
    if(!draftLines.length||draftLines.length>30||draftLines.some(x=>!x.productCode||!x.plant||!Number.isSafeInteger(Number(x.quantity))||x.quantity<1||x.quantity>100000)){
      setDiscussionError('Проверьте товар, завод и количество; должен остаться хотя бы один товар.');return;
    }
    const unchanged=draftLines.length===detail.items.length&&draftLines.every((x,i)=>{
      const old=detail.items[i];return old&&x.itemId===old.itemId&&x.productCode===old.productCode&&x.plant===old.plant&&Number(x.quantity)===Number(old.quantity);
    });
    if(unchanged){setDiscussionError('Состав не изменился. Измените хотя бы одну позицию.');return}
    setActionBusy(true);setDiscussionError('');setDiscussionMessage('');
    try{
      await postV2({action:'propose',orderId:selected,eventId:'ev_v2_'+key(),reason:proposalReason.trim(),
        items:draftLines.map(x=>({itemId:x.itemId||'NEW-'+x.key,productCode:x.productCode,plant:x.plant,quantity:Number(x.quantity)}))});
      setDiscussionMessage('Предложение сохранено: товары и заводы изменятся только после согласования заявщиком и отдельного применения логистом.');
      setProposalOpen(false);setProposalReason('');await loadDetail(selected);haptic();
    }catch(e:any){setDiscussionError(e?.message||'Не удалось передать предложение')}
    finally{setActionBusy(false)}
  };
  const deliveryLabels=<div className="switcher">
    {(['Самовывоз','Доставка'] as const).map(type=><button type="button" key={type}
      className={'switch-btn '+(deliveryType===type?'selected':'')} onClick={()=>setDeliveryType(type)}>
      {ico(type==='Самовывоз'?'box-linear':'delivery-linear',20)}{type}</button>)}
  </div>;

  if(auth!=='ready')return <main className="auth-screen">
    <div className="ambient a1"/><div className="ambient a2"/>
    <div className="auth-card glass-card"><img className="company-logo large" src={fatirCompanyLogo} alt="ФАТИР — фирменный логотип" />
      <span className="overline">FATIR · SECURE WORKSPACE</span>
      <h1>{auth==='checking'?'Подключаем рабочее пространство':'Доступ ограничен'}</h1>
      <p>{auth==='checking'?'Проверяем подпись Telegram и список пользователей USERS…':authMessage}</p>
      <div className="auth-line">{ico('shield-check-linear',17)} Доступ только сотрудникам FATIR</div>
    </div>
  </main>;

  return <div className="shell">
    <div className="ambient a1"/><div className="ambient a2"/><div className="ambient a3"/>
    <header className="site-header">
      <div className="header-inner glass-surface">
        <div className="brand" onClick={()=>setView('new')} role="button" tabIndex={0}>
          <img className="company-logo" src={fatirCompanyLogo} alt="ФАТИР" />
          <div className="brand-type"><strong>FATIR</strong><small>Logistics Workspace</small></div>
        </div>
        <nav className="main-nav" aria-label="Навигация">
          <button type="button" onClick={()=>setView('new')} className={view==='new'?'active':''}>{ico('document-add-linear',18)} Заявка</button>
          <button type="button" onClick={()=>setView('inbox')} className={view==='inbox'?'active':''}>{ico('chat-round-dots-linear',18)} {isLogist?'Обсуждения':'Мои заявки'}</button>
        </nav>
        <div className="user-pill">{ico('shield-check-linear',16)}
          <span><b>{user?.name||'Сотрудник'}</b><small>{isLogist?'Логистика · авторизован': 'Заявщик · авторизован'}</small></span>
          <div className="user-avatar">{(user?.name||'F').slice(0,1).toUpperCase()}</div>
        </div>
      </div>
    </header>
    <main className="app-main">
    {view==='new'?<>
      <section className="hero">
        <div className="hero-copy"><div className="overline"><span className="live-dot"/> FATIR / ORDER MANAGEMENT / 01</div>
          <h1>Новая <em>заявка.</em></h1>
          <p>Клиент, товары и отгрузка — всё в одном удобном рабочем пространстве.</p>
          <div className="hero-pills"><Pill icon="shield-check-linear" text="Защищено Telegram"/><Pill icon="buildings-linear" text="3 завода"/><Pill icon="box-linear" text={products.length+' товаров'}/></div>
        </div>
        <div className="hero-illustration glass-card"><div className="orb-illustration">
          {ico('box-minimalistic-linear',60)}</div><div className="orb-meta"><span>FATIR FLOW</span><b>Order → Logistics</b></div></div>
      </section>
      {result?<section className="result-card glass-card">
        <div className="result-icon">{ico(result.pending?'hourglass-line-linear':'check-circle-bold-duotone',42)}</div>
        <span className="overline">{result.pending?'ОБРАБОТКА ЗАЯВКИ':'ЗАЯВКА ЗАРЕГИСТРИРОВАНА'}</span>
        <h2>{result.pending?'Ожидаем номер ORD':result.orderId}</h2>
        <p>{result.pending?'Выполняется проверка товаров и запись в Google Sheets. Не отправляйте заявку повторно.':
          'Номер клиента: '+result.clientId+'. '+(result.requiresReview?'Нужно согласование нового клиента.':'Логистика получила заявку.')}</p>
        {pollError&&<Warning>{pollError}</Warning>}
        {!result.pending&&<button type="button" className="btn-primary" onClick={reset}>{ico('add-circle-linear',20)} Создать следующую</button>}
      </section>:<div className="form-layout">
        <div className="form-panels">
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('user-id-linear',22)}</div><div><span className="step-label">ШАГ 01 / 03</span><h2>Клиент</h2><p>Выберите из базы или добавьте нового</p></div></div>
            <div className="field"><label htmlFor="customer">Клиент из базы</label><div className="control-wrap">{ico('users-group-rounded-linear',19)}
              <select id="customer" value={clientId} onChange={e=>{
                const v=e.target.value;setClientId(v);
                const c=clients.find(x=>x.code===v);
                if(c){setClientName('');setRegion(c.region||REGIONS[0]);setCity(c.city||'')}
              }}><option value="">+ Новый клиент</option>{clients.map(c=><option key={c.code} value={c.code}>{c.name} · {c.code}</option>)}</select>
            </div></div>
            {!clientId&&<div className="field"><label htmlFor="customer-new">Имя нового клиента</label><input id="customer-new" placeholder="Имя или название магазина"
                value={clientName} onChange={e=>setClientName(e.target.value)} maxLength={160}/><p className="field-hint">Код клиента назначится автоматически, подтвердит логист.</p></div>}
            <div className="field-grid"><div className="field"><label htmlFor="region">Регион</label><select id="region" value={region} onChange={e=>setRegion(e.target.value)}>
              {REGIONS.map(x=><option key={x}>{x}</option>)}</select></div>
              <div className="field"><label htmlFor="city">Город / район</label><input id="city" placeholder="Например, Истаравшан" value={city} onChange={e=>setCity(e.target.value)} maxLength={160}/></div></div>
          </section>
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('box-linear',22)}</div><div><span className="step-label">ШАГ 02 / 03</span><h2>Товары и заводы</h2><p>Один заказ с нескольких производств</p></div></div>
            {lines.map((line,i)=>{
              const p=products.find(x=>x.code===line.productCode);
              return <div className="line-card" key={line.key}>
                <div className="line-top"><span className="line-index">{String(i+1).padStart(2,'0')}</span><strong>Товарная позиция</strong>
                  <button type="button" className="icon-button danger-hover" title="Убрать позицию" disabled={lines.length===1}
                   onClick={()=>setLines(ls=>ls.filter(x=>x.key!==line.key))}>{ico('trash-bin-trash-linear',18)}</button>
                </div>
                <div className="field"><label>Наименование товара</label>
                  <select value={line.productCode} onChange={e=>updateLine(line.key,{productCode:e.target.value})}>
                  <option value="">Выберите товар из каталога</option>{products.map(p=><option key={p.code} value={p.code}>{p.name} · {p.code}</option>)}</select>
                </div>
                <div className="field-grid"><div className="field"><label>Завод</label><select value={line.plant}
                  onChange={e=>updateLine(line.key,{plant:e.target.value})}><option value="">Выбрать завод</option>
                  {PLANTS.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></div>
                  <div className="field"><label>Количество, мешков</label><div className="quantity-control">
                    <button type="button" onClick={()=>updateLine(line.key,{quantity:Math.max(1,line.quantity-1)})}>{ico('minus-circle-linear',19)}</button>
                    <input aria-label="Количество мешков" type="number" min={1} max={100000} value={line.quantity}
                      onChange={e=>updateLine(line.key,{quantity:Number(e.target.value)})}/>
                    <button type="button" onClick={()=>updateLine(line.key,{quantity:line.quantity+1})}>{ico('add-circle-linear',19)}</button>
                  </div></div></div>
                {p&&<div className="line-footer"><span>{p.weight} кг / мешок</span><b>{fmt(p.weight*line.quantity)} кг</b></div>}
              </div>
            })}
            <button type="button" className="btn-dashed" onClick={()=>setLines(x=>[...x,firstLine()])}>{ico('add-circle-linear',20)} Добавить товар</button>
            <div className="total-strip"><div><span>Всего мешков</span><strong>{fmt(totalBags)}</strong></div>
              <div><span>Общая масса</span><strong>{fmt(totalWeight)} <small>кг</small></strong></div></div>
            <p className="notice-line">{ico('info-circle-linear',16)} Выбранный завод не означает резервирование. Остатки подтверждает склад.</p>
          </section>
          <section className="form-card glass-card">
            <div className="card-head"><div className="step-icon">{ico('delivery-linear',23)}</div><div><span className="step-label">ШАГ 03 / 03</span><h2>Отгрузка</h2><p>Условия получения и дополнительные сведения</p></div></div>
            <div className="field"><label>Способ получения</label>{deliveryLabels}</div>
            <div className="field-grid"><div className="field"><label htmlFor="date">Желаемая дата</label><input id="date" type="date" value={deliveryDate} onChange={e=>setDeliveryDate(e.target.value)}/></div>
              <div className="field"><label htmlFor="address">Адрес / ориентир</label><input id="address" value={address} onChange={e=>setAddress(e.target.value)} placeholder="При необходимости" maxLength={160}/></div></div>
            <div className="field"><label htmlFor="notes">Примечание к заказу</label><textarea id="notes" rows={3} value={notes}
              onChange={e=>setNotes(e.target.value)} placeholder="Уточнения, автомобиль клиента, пожелания..." maxLength={400}/></div>
          </section>
          {errorText&&<Warning>{errorText}</Warning>}
          <div className="submit-row"><p>{ico('shield-check-linear',17)} Только авторизованные заявки</p>
            <button type="button" className="btn-primary" disabled={busy||!products.length} onClick={submit}>
              {busy?'Отправка…':'Отправить заявку'} {ico('arrow-right-up-linear',19)}</button></div>
        </div>
        <aside className="summary-column"><div className="summary-card glass-card">
          <div className="summary-head">{ico('clipboard-list-linear',21)}<span>Обзор заказа</span></div>
          <div className="summary-number">{String(totalBags).padStart(2,'0')}<small>мешков</small></div>
          <div className="summary-kpi"><span>Масса</span><b>{fmt(totalWeight)} кг</b></div>
          <div className="summary-kpi"><span>Заводов</span><b>{new Set(lines.filter(x=>x.plant).map(x=>x.plant)).size}</b></div>
          <div className="summary-kpi"><span>Способ получения</span><b>{deliveryType}</b></div>
          <div className="summary-divider"/>
          <p>{ico('shield-check-linear',18)} Регистрация через защищённый сервер FATIR</p>
        </div></aside>
      </div>}
    </>:<>
      <section className="hero inbox-hero"><div><div className="overline"><span className="live-dot"/> FATIR / DISCUSSION DESK / 02</div>
        <h1>{isLogist?'Рабочее место':'Мои'} <em>{isLogist?'логиста.':'заявки.'}</em></h1>
        <p>История решений, уточнения и согласование изменений по каждому ORD.</p></div>
        <button className="btn-light" onClick={loadOrders} disabled={listBusy}>{ico('refresh-linear',19)} Обновить</button>
      </section>
      <div className="workspace">
        <aside className={'queue glass-card '+(selected?'queue-mobile-hide':'')}>
          <div className="queue-head"><div><span className="overline">РАБОЧАЯ ОЧЕРЕДЬ</span><h2>Заявки <span>{queueCounts.all}</span></h2></div>
            <button title="Обновить" className="icon-button" onClick={loadOrders}>{ico('refresh-circle-linear',20)}</button></div>
          <div className="queue-dashboard"><div><strong>{queueCounts.discussion}</strong><span>Обсуждение</span></div><div><strong>{queueCounts.review}</strong><span>Проверить</span></div><div><strong>{queueCounts.new}</strong><span>Новые</span></div></div>
          <div className="queue-search">{ico('magnifer-linear',19)}<input placeholder="Поиск ORD, клиента, города..." value={orderSearch} onChange={e=>setOrderSearch(e.target.value)}/></div>
          <div className="queue-auto"><label><input type="checkbox" checked={queueAutoRefresh} onChange={e=>setQueueAutoRefresh(e.target.checked)}/> Обновлять каждые 45 с</label><span>{queueRefreshedAt?'Обновлено '+queueRefreshedAt.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'Ожидание'}</span></div>
          <div className="filters">
            {[['ALL','Все'],['DISCUSSION','Обсуждение'],['NEEDS_REVIEW','Проверить'],['DRAFT','Новые']].map(([val,label])=>
              <button key={val} className={filter===val?'on':''} onClick={()=>setFilter(val)}>{label}</button>)}
          </div>
          <div className="queue-list">
            {listBusy&&<div className="queue-empty">Обновляем список…</div>}
            {!listBusy&&!allFiltered.length&&<div className="queue-empty">{ico('box-linear',25)}<span>Заявок по фильтру нет</span></div>}
            {allFiltered.map(o=><button type="button" key={o.orderId} className={'queue-item '+(selected===o.orderId?'active':'')}
              onClick={()=>{haptic();setSelected(o.orderId);setDetail(null);setProposalOpen(false);setAuditOffset(0)}}>
              <div className="queue-top"><b>{o.orderId}</b><span>{fmtTime(o.updatedAt)}</span></div>
              <div className="queue-client">{o.clientName||'Клиент не указан'}</div>
              <div className="queue-bottom"><Status value={o.status}/><span>{fmt(o.totalBags)} меш.</span></div>
            </button>)}
          </div>
        </aside>
        <div className="order-desk glass-card">
          {selected&&<button type="button" className="back-mobile" onClick={()=>{setSelected('');setDetail(null)}}>{ico('alt-arrow-left-linear',19)} Все заявки</button>}
          {discussionError&&<Warning>{discussionError}</Warning>}
          {discussionMessage&&<div className="notice-success">{ico('check-circle-linear',18)} {discussionMessage}</div>}
          {!selected?<div className="blank-desk"><div className="blank-graphic">{ico('chat-round-dots-linear',45)}</div>
            <h2>Выберите заявку</h2><p>Здесь появятся детали заказа, история обсуждения и инструменты логиста.</p></div>:
          detailBusy&&!detail?<div className="blank-desk"><div className="loader"/><p>Загружаем историю заказа…</p></div>:
          detail?<div className="desk-content">
            <div className="order-top"><div><span className="overline">ЗАЯВКА / {detail.order.orderId}</span>
              <h2>{detail.order.clientName||'Неизвестный клиент'}</h2>
              <p>{ico('map-point-linear',17)} {detail.order.region}, {detail.order.city}</p></div>
              <div className="order-actions"><Status value={detail.order.status}/><button className="icon-button" title="Обновить карточку" onClick={()=>loadDetail(selected)}>{ico('refresh-linear',19)}</button></div></div>
            <div className="metrics">
              <div>{ico('box-linear',20)}<div><span>Мешки</span><b>{fmt(detail.order.totalBags)}</b></div></div>
              <div>{ico('scale-linear',20)}<div><span>Масса</span><b>{fmt(detail.order.totalWeightKg)} кг</b></div></div>
              <div>{ico('calendar-linear',20)}<div><span>Дата</span><b>{detail.order.deliveryDate||'Не указана'}</b></div></div>
              <div>{ico('delivery-linear',20)}<div><span>Получение</span><b>{detail.order.deliveryType||'Не указано'}</b></div></div>
            </div>
            {!!detail.order.reviewReason&&<Warning>Причина проверки: {detail.order.reviewReason}</Warning>}
            <div className="desk-section"><div className="desk-title"><div>{ico('box-linear',21)}<h3>Состав заявки</h3></div><span>{detail.items.length} поз.</span></div>
              <div className="goods-table">{detail.items.map((line,i)=><div className="goods-row" key={line.itemId||i}>
                <div className="goods-num">{String(i+1).padStart(2,'0')}</div><div className="goods-name"><b>{line.productName}</b><small>{line.productCode||'SKU не подтверждён'} · {plantName(line.plant)}</small></div>
                <div className="goods-qty"><b>{fmt(line.quantity)}</b><small>меш.</small></div>
                <div className="goods-mass"><b>{fmt(line.quantity*line.unitWeight)}</b><small>кг</small></div>
              </div>)}</div>
            </div>
            <div className="desk-section"><div className="desk-title">
                <div>{ico('chat-line-linear',21)}<h3>Обсуждение и история</h3></div>
                <div className="audit-controls">
                  <span>{detail.timeline.length} событий</span>
                  {isLogist&&<button className="btn-light small" disabled={auditBusy} onClick={repairAudit}>
                    {ico('refresh-circle-linear',16)} {auditBusy?'Сверяем…':'Сверить журнал'}
                  </button>}
                </div>
              </div>
              {!detail.timeline.length&&<div className="conversation-empty">{ico('chat-round-dots-linear',24)}
                <p>Пока нет сообщений. Логист может запросить уточнение или предложить корректировку.</p></div>}
              <div className="timeline">{detail.timeline.map(ev=><div className={'message '+(ev.actorId===user?.id?'mine':'')} key={ev.id}>
                <div className="message-avatar">{ev.actorName?.charAt(0)||'F'}</div><div className="message-body">
                  <div className="message-meta"><b>{ev.actorName||ev.role}</b>
                      <span>{fmtTime(ev.createdAt)}{ev.auditSynced===false?' · Журнал ждёт сверки':''}</span>
                    </div>
                  {ev.kind==='PROPOSAL'?<div className="proposal-message">
                    <div className="proposal-header">{ico('document-add-linear',19)} Предложение по товарам <Status value={ev.status==='PENDING'?'DISCUSSION':ev.status==='ACCEPTED'?'CONFIRMED':ev.status==='APPLIED'?'APPLIED':'REJECTED'}/></div>
                    <p>{ev.reason||ev.text}</p>
                    {ev.items?.map((li,i)=>{
                      const previous=ev.v2?detail.items.find(x=>x.itemId===li.itemId):detail.items[i];
                      const comparable=ev.baseVersion==null||Number(ev.baseVersion)===Number(detail.order.version);
                      const changed=Boolean(comparable&&(!previous||previous.productCode!==li.productCode||previous.plant!==li.plant||previous.quantity!==li.quantity));
                      return <div className={'proposal-summary '+(changed?'proposal-changed':'')} key={i}>
                        <div className="proposal-current">
                          <span>{!previous&&ev.v2?'＋ Новая позиция · ':''}{li.productName} · {plantName(li.plant)}</span>
                          <b>{fmt(li.quantity)} меш.</b>
                        </div>
                        {changed&&previous&&<div className="proposal-compare">
                          <div className="proposal-prior"><small>БЫЛО</small>
                            <span>{previous.productName} · {plantName(previous.plant)} · {fmt(previous.quantity)} меш.</span>
                          </div>
                          <span className="compare-arrow">{ico('arrow-right-linear',16)}</span>
                          <div className="proposal-after"><small>ПРЕДЛОЖЕНО</small>
                            <span>{li.productName} · {plantName(li.plant)} · {fmt(li.quantity)} меш.</span>
                          </div>
                        </div>}
                        {!comparable&&<p className="proposal-archive-hint">Предложение предыдущей версии ORD — сравнение со старым составом недоступно.</p>}
                      </div>;
                    })}
                    {ev.v2&&ev.items&&Number(ev.baseVersion)===Number(detail.order.version)&&detail.items.filter(old=>!ev.items?.some(proposed=>proposed.itemId===old.itemId)).map(old=>
                      <div className="removed-item" key={old.itemId}>{ico('trash-bin-trash-linear',18)} Исключить: <b>{old.productName}</b> · {fmt(old.quantity)} меш. · {plantName(old.plant)}</div>)}
                    {ev.status==='PENDING'&&detail.isRequester&&ev.actorId!==user?.id&&<div className="decision-actions">
                      <button className="btn-primary small" disabled={actionBusy} onClick={()=>ev.v2?decideV2(ev.id,true):postAction('/api/discussions/decision',{proposalId:ev.id,approve:true})}>{ico('check-circle-linear',18)} Согласовать</button>
                      <button className="btn-light small" disabled={actionBusy} onClick={()=>ev.v2?decideV2(ev.id,false):postAction('/api/discussions/decision',{proposalId:ev.id,approve:false})}>{ico('close-circle-linear',18)} Отклонить</button>
                    </div>}
                    {ev.status==='ACCEPTED'&&<div className="apply-panel">
                      <p className="proposal-foot">{ico('info-circle-linear',17)} Заявщик согласовал предложенные изменения. Логист может применить их к ORD после проверки.</p>
                      {detail.canEdit&&detail.order.status==='DISCUSSION'&&<button className="btn-primary small" disabled={actionBusy}
                        onClick={()=>setApplyTarget(ev)}>{ico('check-circle-linear',17)} Применить к ORD</button>}
                    </div>}
                    {ev.status==='APPLIED'&&<p className="proposal-foot">{ico('check-circle-linear',17)} Изменения сохранены в Google Sheets. Заявка передана на повторную проверку.</p>}
                  </div>:<p>{ev.text}</p>}
                </div>
              </div>)}</div>
              {!canDiscuss(detail.order.status)&&['DRAFT','NEEDS_REVIEW'].includes(detail.order.status)&&detail.canEdit&&<div className="notice-line start-hint">{ico('info-circle-linear',17)} Для начала обсуждения нажмите «Обсудить» в карточке этого ORD в Telegram-канале логистов. После этого бот пришлёт вам кнопку входа.</div>}
              {canDiscuss(detail.order.status)?<div className="composer">
                <div className="composer-title">{ico('pen-new-square-linear',18)} {isLogist?'Ответ / уточнение от логиста':'Ответ заявщика'}</div>
                <textarea value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={isLogist?'Что нужно уточнить у заявщика?':'Ответьте на запрос логиста…'} rows={3}/>
                <div className="composer-footer">{isLogist&&<div className="type-toggle"><button className={commentKind==='QUESTION'?'on':''} onClick={()=>setCommentKind('QUESTION')}>Вопрос</button>
                    <button className={commentKind==='NOTE'?'on':''} onClick={()=>setCommentKind('NOTE')}>Заметка</button></div>}
                  <button type="button" className="btn-primary small" disabled={actionBusy||commentText.trim().length<3}
                    onClick={()=>postAction('/api/discussions/comment',{text:commentText,kind:commentKind})}>{ico('plain-2-linear',17)} Отправить</button></div>
              </div>:<div className="notice-line">{ico('lock-keyhole-linear',16)} Обсуждение закрыто для текущего статуса заявки.</div>}
            </div>
            {detail.canEdit&&canDiscuss(detail.order.status)&&<div className="desk-section proposal-panel">
              <div className="desk-title"><div>{ico('pen-new-square-linear',21)}<h3>Уточнение товаров</h3></div>
                <button className="btn-light small" onClick={()=>proposalOpen?setProposalOpen(false):openProposal()}>{ico(proposalOpen?'close-circle-linear':'add-circle-linear',18)} {proposalOpen?'Закрыть':'Предложить правки'}</button></div>
              <p className="muted-copy">Исправления отправляются заявщику на согласование. Исходный ORD и товары остаются неизменными до отдельного применения.</p>
              {proposalOpen&&<div className="proposal-editor">
                {draftLines.map((li,i)=>{
                  const prod=products.find(p=>p.code===li.productCode);
                  return <div className="line-card" key={li.key}><div className="line-top"><b>Позиция {i+1}</b>
                    <span className={'revision-type '+(li.itemId?.startsWith('NEW-')?'is-new':'')}>{li.itemId?.startsWith('NEW-')?'Новая':'Из заказа'}</span>
                    <button type="button" className="icon-button danger-hover" title="Исключить позицию из предложенного состава"
                      disabled={draftLines.length===1||actionBusy}
                      onClick={()=>setDraftLines(v=>v.filter(x=>x.key!==li.key))}>{ico('trash-bin-trash-linear',19)}</button></div>
                    <div className="field"><label>Товар</label><select value={li.productCode} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,productCode:e.target.value}:x))}>
                      <option value="">Выберите товар</option>{products.map(p=><option value={p.code} key={p.code}>{p.name} · {p.code}</option>)}</select></div>
                    <div className="field-grid"><div className="field"><label>Завод для отгрузки / перевода</label><select value={li.plant} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,plant:e.target.value}:x))}>
                      <option value="">Выбрать завод</option>{PLANTS.map(p=><option value={p.code} key={p.code}>{p.name}</option>)}</select></div>
                      <div className="field"><label>Мешки</label><input type="number" min="1" max="100000" value={li.quantity} onChange={e=>setDraftLines(arr=>arr.map(x=>x.key===li.key?{...x,quantity:Number(e.target.value)}:x))}/></div></div>
                    {prod&&<div className="line-footer">{prod.weight} кг за мешок<span>{fmt(prod.weight*li.quantity)} кг</span></div>}
                  </div>;
                })}
                <button type="button" className="btn-dashed" disabled={draftLines.length>=30||actionBusy}
                  onClick={()=>setDraftLines(v=>[...v,{...firstLine(),itemId:'NEW-'+key()}])}>
                  {ico('add-circle-linear',19)} Добавить позицию</button>
                <div className="revision-preview">
                  <div><span>До изменений</span><b>{fmt(detail.order.totalBags)} меш. · {fmt(detail.order.totalWeightKg)} кг</b></div>
                  <span>{ico('arrow-right-linear',20)}</span>
                  <div><span>После изменений</span><b>{fmt(draftBagCount)} меш. · {fmt(draftTotal)} кг</b></div>
                </div>
                <p className="notice-line">{ico('info-circle-linear',17)} Замена завода меняет источник планируемой отгрузки, но не перемещает физические остатки. После согласования склад проверяет наличие на выбранном заводе.</p>
                <div className="field"><label>Причина исправления *</label><textarea value={proposalReason} onChange={e=>setProposalReason(e.target.value)} placeholder="Причина: добавить товар, убрать позицию, заменить сорт, изменить количество или отгружать с другого завода…" rows={3}/></div>
                <button className="btn-primary" disabled={actionBusy} onClick={submitProposal}>{ico('plain-2-linear',19)} Отправить на согласование</button>
              </div>}
            </div>}
            {!!detail.order.sourceText&&<details className="original-details"><summary>{ico('document-text-linear',18)} Исходное сообщение</summary><pre>{detail.order.sourceText}</pre></details>}
          </div>:<div className="blank-desk"><Warning>Не удалось получить данные заявки. Повторите загрузку.</Warning></div>}
        </div>
      </div>
    </>}
    </main>
    {applyTarget&&<div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="apply-title">
      <div className="dialog-card glass-card">
        <div className="dialog-icon">{ico('shield-check-linear',30)}</div>
        <span className="overline">FATIR / КОНТРОЛЬ ИЗМЕНЕНИЙ</span>
        <h2 id="apply-title">Применить исправления?</h2>
        <p>Будут обновлены актуальные позиции, их заводы и итоговая масса заказа <strong>{selected}</strong> в Google Sheets. Исключённые позиции останутся в журнале с нулевым количеством. Перед записью проверяются статус, версия ORD, права логиста и официальные SKU. Физическое перемещение остатков здесь не выполняется.</p>
        <div className="dialog-buttons"><button className="btn-light" disabled={actionBusy} onClick={()=>setApplyTarget(null)}>Отмена</button>
          <button className="btn-primary" disabled={actionBusy} onClick={applyApproved}>{actionBusy?'Применяем…':'Подтвердить применение'} {ico('check-circle-linear',19)}</button></div>
      </div>
    </div>}
    <footer className="site-footer"><span>© FATIR • Logistics Workspace</span><span>Solar icons — 480 Design / IconBuddy · CC BY 4.0</span></footer>
    <nav className="mobile-dock glass-surface" aria-label="Мобильная навигация">
      <button className={view==='new'?'active':''} onClick={()=>setView('new')}>{ico('document-add-linear',22)}<span>Заявка</span></button>
      <button className={view==='inbox'?'active':''} onClick={()=>setView('inbox')}>{ico('chat-round-dots-linear',22)}<span>{isLogist?'Логистика':'Мои заявки'}</span></button>
      <button onClick={()=>{haptic();view==='inbox'?loadOrders():setView('inbox')}}>{ico('refresh-circle-linear',22)}<span>Обновить</span></button>
    </nav>
  </div>;
}
