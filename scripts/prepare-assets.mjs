import {copyFile,mkdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/vendor/',root),{recursive:true});
for(const [from,to] of [
 ['dist/ag-grid-community.min.noStyle.js','ag-grid-community.js'],
 ['styles/ag-grid.min.css','ag-grid.css'],
 ['styles/ag-theme-quartz.min.css','ag-theme-quartz.css'],
 ['LICENSE.txt','AG-GRID-LICENSE.txt']
])await copyFile(new URL('node_modules/ag-grid-community/'+from,root),new URL('public/vendor/'+to,root));
console.log('Prepared local AG Grid Community assets.');
