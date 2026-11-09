const allowed=new Set(['approval','completed','denied','executing','pending','unknown','failed']);
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n/100);
export function gridRows(requests){return requests.map(r=>({...r,amountUSD:r.amount/100,createdAt:new Date(r.created)}));}
export function statusElement(value,doc=document){const el=doc.createElement('span');el.className='badge '+(allowed.has(value)?value:'');el.textContent=value==='approval'?'Needs approval':String(value??'');return el;}
export function actionElement(row,doc=document){
 const wrap=doc.createElement('div');wrap.className='grid-actions';
 const button=(text,key)=>{const el=doc.createElement('button');el.className='secondary';el.type='button';el.textContent=text;el.dataset[key]=row.id;el.setAttribute('aria-label',text+' refund '+money(row.amount)+' request '+row.id.slice(0,8));wrap.append(el);};
 button('Details','detail');
 if(row.status==='approval'){button('Approve','approve');button('Reject','reject');}
 if(['pending','unknown'].includes(row.status))button('Check outcome','reconcile');
 return wrap;
}
let queue='all';try{queue=sessionStorage.getItem('agentgate-review-queue')||'all';}catch{}
export function queueRows(rows,name){return rows.filter(r=>name==='approval'?r.status==='approval':name==='uncertain'?['pending','unknown','executing'].includes(r.status):name==='blocked'?r.status==='denied':true);}
let grid=null,saved={search:'',status:'',filters:null,columns:null,page:0};
export function destroyRefundGrid(){if(grid){saved.filters=grid.getFilterModel();saved.columns=grid.getColumnState();saved.page=grid.paginationGetCurrentPage();grid.destroy();grid=null;}}
export function mountRefundGrid(requests,onSelect=()=>{}){
 const host=document.querySelector('#refund-grid');if(!host)return;
 const ag=window.agGrid;if(!ag?.createGrid){host.textContent='The review grid could not load. Run npm install, restart AgentGate, and reload.';return;}
 const search=document.querySelector('#refund-search'),status=document.querySelector('#refund-status');search.value=saved.search;status.value=saved.status;
 grid=ag.createGrid(host,{
  theme:'legacy',rowData:gridRows(queueRows(requests,queue)),onRowClicked:p=>onSelect(p.data.id),getRowId:p=>p.data.id,
  defaultColDef:{sortable:true,resizable:true,filter:true,floatingFilter:true,editable:false,minWidth:140},
  columnDefs:[
   {field:'capture',headerName:'Payment',minWidth:190,flex:1},
   {field:'amountUSD',headerName:'Amount · USD',filter:'agNumberColumnFilter',width:150,valueFormatter:p=>money(Math.round(p.value*100))},
   {field:'status',headerName:'Status',width:170,cellRenderer:p=>statusElement(p.value)},
   {field:'reason',headerName:'Policy decision',minWidth:235,flex:1},
   {field:'createdAt',headerName:'Requested',filter:'agDateColumnFilter',width:185,valueFormatter:p=>p.value.toLocaleString(),sort:'desc'},
   {field:'id',headerName:'Request ID',width:310,hide:true},
   {field:'note',headerName:'Customer request',minWidth:260,hide:true,wrapText:true,autoHeight:true},
   {headerName:'Actions',colId:'actions',pinned:'right',minWidth:255,width:280,sortable:false,filter:false,floatingFilter:false,cellRenderer:p=>actionElement(p.data)}
  ],
  pagination:true,paginationPageSize:10,paginationPageSizeSelector:[10,25,50],rowHeight:62,headerHeight:44,
  quickFilterText:saved.search,overlayNoRowsTemplate:'No matching refund requests. Clear the filters or create a new request.',
  onFilterChanged:()=>{if(grid){saved.filters=grid.getFilterModel();const model=saved.filters.status;saved.status=model?.type==='equals'?model.filter:'';status.value=saved.status;}}
 });
const queueButtons=document.querySelectorAll('[data-refund-queue]');
 const syncQueue=()=>queueButtons.forEach(b=>{b.classList.toggle('active',b.dataset.refundQueue===queue);b.setAttribute('aria-pressed',String(b.dataset.refundQueue===queue));});
 queueButtons.forEach(b=>{b.onclick=()=>{queue=b.dataset.refundQueue;try{sessionStorage.setItem('agentgate-review-queue',queue);}catch{}grid.setGridOption('rowData',gridRows(queueRows(requests,queue)));grid.setGridOption('quickFilterText','');grid.setFilterModel(null);saved.search='';search.value='';grid.paginationGoToFirstPage();syncQueue();onSelect(queueRows(requests,queue)[0]?.id);};});syncQueue();if(queue!=='all')onSelect(queueRows(requests,queue)[0]?.id);
  if(saved.columns)grid.applyColumnState({state:saved.columns,applyOrder:true});
 if(saved.filters)grid.setFilterModel(saved.filters);
 grid.paginationGoToPage(saved.page);
 search.oninput=()=>{saved.search=search.value;grid.setGridOption('quickFilterText',saved.search);};
 status.onchange=()=>{saved.status=status.value;const filters=grid.getFilterModel();if(saved.status)filters.status={filterType:'text',type:'equals',filter:saved.status};else delete filters.status;grid.setFilterModel(filters);};
 document.querySelector('#clear-refund-filters').onclick=()=>{saved.search='';saved.status='';search.value='';status.value='';grid.setGridOption('quickFilterText','');grid.setFilterModel(null);};
}
