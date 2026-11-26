const { buildMails, shouldSend } = require('./mail');
const P=(id,name,pc,fc,extra)=>({id,name,makerName:'テスト工務店',pc:'泉',pcdates:pc?[pc]:[],finalCheck:fc,...(extra||{})});
const data={properties:[P(1,'P1','2026-11-30','2026-11-09'),P(2,'P2','2026-12-03','2026-11-25'),P(3,'P3','2026-12-10',''),P(4,'P4','2026-11-27','2026-11-25',{hwOrdered:true}),P(5,'P5','2026-11-01',''),P(6,'P6','2026-12-20','2026-11-20'),{...P(7,'安松の物件','2026-11-30',''),pc:'安松'}],holidays:[]};
const today=new Date(2026,10,26);
for(const k of ['hw','fc'])for(const m of buildMails(data,k,today,{}))console.log('---',m.to,'\n'+m.subject+'\n'+m.body);
const t=(h,mi,d=26)=>new Date(2026,10,d,h,mi);
console.log('hw 07:59',shouldSend('hw',data,t(7,59),{},''),'08:00',shouldSend('hw',data,t(8,0),{},''),'sent',shouldSend('hw',data,t(9,0),{},'2026-11-26'),'Sat',shouldSend('hw',data,t(9,0,28),{},''));
console.log('fc Thu',shouldSend('fc',data,t(8,5),{},''),'fc Fri',shouldSend('fc',data,t(8,5,27),{},''));
