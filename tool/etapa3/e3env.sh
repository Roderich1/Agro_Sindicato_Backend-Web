# Entorno del recorrido E3 (aislado: 15434/3350/5175). Sin secretos: las contraseñas son de un solo uso por tubería.
export DEMO_PG_ADMIN_URL=postgresql://postgres@127.0.0.1:15434/postgres DEMO_API=http://127.0.0.1:3350/api/v1 DEMO_SEED=agrocuentas-etapa1-1
export BROWSER_PATH="C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" PUPPETEER_HOME=C:/Users/MSI/AppData/Local/Temp/agro_demo_web_tools
export BE_DIR=C:/Users/MSI/Documents/ProyectoDeGrado/ProyectoAgro/_wt/ET2-BE OUT=C:/Users/MSI/AppData/Local/Temp/agro_et1/e3
show() { node -e "const r=require('$OUT/'+process.argv[1]+'.json');console.log(JSON.stringify({err:r.error,final:r.final_state,banner:r.banner,note:r.comparison_note,lines:r.lines,sel:r.selection,api:r.api.filter(a=>/collective|estimation|joint/.test(a))},null,1))" "$1"; }
