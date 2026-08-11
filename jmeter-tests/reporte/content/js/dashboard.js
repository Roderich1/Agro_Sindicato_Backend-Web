/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

/*
 * Add header in statistics table to group metrics by category
 * format
 *
 */
function summaryTableHeader(header) {
    var newRow = header.insertRow(-1);
    newRow.className = "tablesorter-no-sort";
    var cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Requests";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 3;
    cell.innerHTML = "Executions";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 7;
    cell.innerHTML = "Response Times (ms)";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 1;
    cell.innerHTML = "Throughput";
    newRow.appendChild(cell);

    cell = document.createElement('th');
    cell.setAttribute("data-sorter", false);
    cell.colSpan = 2;
    cell.innerHTML = "Network (KB/sec)";
    newRow.appendChild(cell);
}

/*
 * Populates the table identified by id parameter with the specified data and
 * format
 *
 */
function createTable(table, info, formatter, defaultSorts, seriesIndex, headerCreator) {
    var tableRef = table[0];

    // Create header and populate it with data.titles array
    var header = tableRef.createTHead();

    // Call callback is available
    if(headerCreator) {
        headerCreator(header);
    }

    var newRow = header.insertRow(-1);
    for (var index = 0; index < info.titles.length; index++) {
        var cell = document.createElement('th');
        cell.innerHTML = info.titles[index];
        newRow.appendChild(cell);
    }

    var tBody;

    // Create overall body if defined
    if(info.overall){
        tBody = document.createElement('tbody');
        tBody.className = "tablesorter-no-sort";
        tableRef.appendChild(tBody);
        var newRow = tBody.insertRow(-1);
        var data = info.overall.data;
        for(var index=0;index < data.length; index++){
            var cell = newRow.insertCell(-1);
            cell.innerHTML = formatter ? formatter(index, data[index]): data[index];
        }
    }

    // Create regular body
    tBody = document.createElement('tbody');
    tableRef.appendChild(tBody);

    var regexp;
    if(seriesFilter) {
        regexp = new RegExp(seriesFilter, 'i');
    }
    // Populate body with data.items array
    for(var index=0; index < info.items.length; index++){
        var item = info.items[index];
        if((!regexp || filtersOnlySampleSeries && !info.supportsControllersDiscrimination || regexp.test(item.data[seriesIndex]))
                &&
                (!showControllersOnly || !info.supportsControllersDiscrimination || item.isController)){
            if(item.data.length > 0) {
                var newRow = tBody.insertRow(-1);
                for(var col=0; col < item.data.length; col++){
                    var cell = newRow.insertCell(-1);
                    cell.innerHTML = formatter ? formatter(col, item.data[col]) : item.data[col];
                }
            }
        }
    }

    // Add support of columns sort
    table.tablesorter({sortList : defaultSorts});
}

$(document).ready(function() {

    // Customize table sorter default options
    $.extend( $.tablesorter.defaults, {
        theme: 'blue',
        cssInfoBlock: "tablesorter-no-sort",
        widthFixed: true,
        widgets: ['zebra']
    });

    var data = {"OkPercent": 45.09803921568628, "KoPercent": 54.90196078431372};
    var dataset = [
        {
            "label" : "FAIL",
            "data" : data.KoPercent,
            "color" : "#FF6347"
        },
        {
            "label" : "PASS",
            "data" : data.OkPercent,
            "color" : "#9ACD32"
        }];
    $.plot($("#flot-requests-summary"), dataset, {
        series : {
            pie : {
                show : true,
                radius : 1,
                label : {
                    show : true,
                    radius : 3 / 4,
                    formatter : function(label, series) {
                        return '<div style="font-size:8pt;text-align:center;padding:2px;color:white;">'
                            + label
                            + '<br/>'
                            + Math.round10(series.percent, -2)
                            + '%</div>';
                    },
                    background : {
                        opacity : 0.5,
                        color : '#000'
                    }
                }
            }
        },
        legend : {
            show : true
        }
    });

    // Creates APDEX table
    createTable($("#apdexTable"), {"supportsControllersDiscrimination": true, "overall": {"data": [0.45098039215686275, 500, 1500, "Total"], "isController": false}, "titles": ["Apdex", "T (Toleration threshold)", "F (Frustration threshold)", "Label"], "items": [{"data": [0.0, 500, 1500, "Inventario Global"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Operaciones Sync"], "isController": false}, {"data": [1.0, 500, 1500, "Campana Activa"], "isController": false}, {"data": [0.0, 500, 1500, "Entrada de Stock"], "isController": false}, {"data": [0.0, 500, 1500, "Compra Conjunta"], "isController": false}, {"data": [0.0, 500, 1500, "Compra al Contado"], "isController": false}, {"data": [1.0, 500, 1500, "Listar Parcelas"], "isController": false}, {"data": [0.0, 500, 1500, "Estado Sincronizacion"], "isController": false}, {"data": [1.0, 500, 1500, "Refresh Token"], "isController": false}, {"data": [0.0, 500, 1500, "Crear Proveedor"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Cuentas Pendientes"], "isController": false}, {"data": [0.0, 500, 1500, "Ajuste de Inventario"], "isController": false}, {"data": [1.0, 500, 1500, "Crear Campana"], "isController": false}, {"data": [0.0, 500, 1500, "Registrar Aplicacion"], "isController": false}, {"data": [1.0, 500, 1500, "Logout"], "isController": false}, {"data": [0.0, 500, 1500, "Sincronizar Operaciones"], "isController": false}, {"data": [1.0, 500, 1500, "Alertas de Stock"], "isController": false}, {"data": [1.0, 500, 1500, "Listar Cultivos"], "isController": false}, {"data": [0.0, 500, 1500, "Bitacora"], "isController": false}, {"data": [0.3333333333333333, 500, 1500, "Login Agricultor"], "isController": false}, {"data": [1.0, 500, 1500, "Crear Parcela"], "isController": false}, {"data": [1.0, 500, 1500, "Listar Productos"], "isController": false}, {"data": [0.0, 500, 1500, "Reporte Productos Vencidos"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Aplicaciones"], "isController": false}, {"data": [1.0, 500, 1500, "Consultar Stock"], "isController": false}, {"data": [0.0, 500, 1500, "Registrar Abono Parcial"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Eventos Calendario"], "isController": false}, {"data": [0.0, 500, 1500, "Compra a Credito"], "isController": false}, {"data": [0.0, 500, 1500, "Reporte Inventario Actual"], "isController": false}, {"data": [1.0, 500, 1500, "Editar Campana"], "isController": false}, {"data": [0.0, 500, 1500, "Reporte Aplicaciones por Parcela"], "isController": false}, {"data": [1.0, 500, 1500, "Crear Usuario Agricultor"], "isController": false}, {"data": [1.0, 500, 1500, "Listar Campanas"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Compras"], "isController": false}, {"data": [0.5, 500, 1500, "Login Directiva"], "isController": false}, {"data": [0.5, 500, 1500, "Login Admin"], "isController": false}, {"data": [1.0, 500, 1500, "Listar Usuarios"], "isController": false}, {"data": [1.0, 500, 1500, "Desactivar Usuario"], "isController": false}, {"data": [0.0, 500, 1500, "Listar Proveedores"], "isController": false}, {"data": [1.0, 500, 1500, "Me"], "isController": false}, {"data": [1.0, 500, 1500, "Asignar Cultivo a Parcela"], "isController": false}, {"data": [1.0, 500, 1500, "Editar Usuario"], "isController": false}, {"data": [0.0, 500, 1500, "Reporte Cuentas por Pagar"], "isController": false}]}, function(index, item){
        switch(index){
            case 0:
                item = item.toFixed(3);
                break;
            case 1:
            case 2:
                item = formatDuration(item);
                break;
        }
        return item;
    }, [[0, 0]], 3);

    // Create statistics table
    createTable($("#statisticsTable"), {"supportsControllersDiscrimination": true, "overall": {"data": ["Total", 51, 28, 54.90196078431372, 25.274509803921553, 2, 205, 3.0, 167.8, 168.8, 205.0, 37.22627737226277, 57.85384352189781, 13.731039005474452], "isController": false}, "titles": ["Label", "#Samples", "FAIL", "Error %", "Average", "Min", "Max", "Median", "90th pct", "95th pct", "99th pct", "Transactions/s", "Received", "Sent"], "items": [{"data": ["Inventario Global", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 64.12760416666667], "isController": false}, {"data": ["Listar Operaciones Sync", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 61.84895833333333], "isController": false}, {"data": ["Campana Activa", 1, 0, 0.0, 7.0, 7, 7, 7.0, 7.0, 7.0, 7.0, 142.85714285714286, 202.1484375, 71.42857142857143], "isController": false}, {"data": ["Entrada de Stock", 1, 1, 100.0, 5.0, 5, 5, 5.0, 5.0, 5.0, 5.0, 200.0, 208.984375, 148.046875], "isController": false}, {"data": ["Compra Conjunta", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 174.47916666666666], "isController": false}, {"data": ["Compra al Contado", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 153.64583333333334], "isController": false}, {"data": ["Listar Parcelas", 1, 0, 0.0, 7.0, 7, 7, 7.0, 7.0, 7.0, 7.0, 142.85714285714286, 341.65736607142856, 70.3125], "isController": false}, {"data": ["Estado Sincronizacion", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 321.9401041666667, 60.546875], "isController": false}, {"data": ["Refresh Token", 1, 0, 0.0, 11.0, 11, 11, 11.0, 11.0, 11.0, 11.0, 90.9090909090909, 164.59517045454547, 21.57315340909091], "isController": false}, {"data": ["Crear Proveedor", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 95.37760416666667], "isController": false}, {"data": ["Listar Cuentas Pendientes", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 67.70833333333333], "isController": false}, {"data": ["Ajuste de Inventario", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 388.9973958333333, 220.37760416666666], "isController": false}, {"data": ["Crear Campana", 1, 0, 0.0, 15.0, 15, 15, 15.0, 15.0, 15.0, 15.0, 66.66666666666667, 91.47135416666667, 39.90885416666667], "isController": false}, {"data": ["Registrar Aplicacion", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 120.44270833333333], "isController": false}, {"data": ["Logout", 1, 0, 0.0, 10.0, 10, 10, 10.0, 10.0, 10.0, 10.0, 100.0, 96.2890625, 57.32421875], "isController": false}, {"data": ["Sincronizar Operaciones", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 174.8046875], "isController": false}, {"data": ["Alertas de Stock", 1, 0, 0.0, 5.0, 5, 5, 5.0, 5.0, 5.0, 5.0, 200.0, 199.0234375, 100.0], "isController": false}, {"data": ["Listar Cultivos", 1, 0, 0.0, 6.0, 6, 6, 6.0, 6.0, 6.0, 6.0, 166.66666666666666, 477.5390625, 82.03125], "isController": false}, {"data": ["Bitacora", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 60.221354166666664], "isController": false}, {"data": ["Login Agricultor", 3, 2, 66.66666666666667, 57.66666666666667, 3, 167, 3.0, 167.0, 167.0, 167.0, 5.905511811023622, 7.412647637795276, 1.3725701279527558], "isController": false}, {"data": ["Crear Parcela", 1, 0, 0.0, 13.0, 13, 13, 13.0, 13.0, 13.0, 13.0, 76.92307692307693, 107.57211538461539, 45.29747596153847], "isController": false}, {"data": ["Listar Productos", 1, 0, 0.0, 8.0, 8, 8, 8.0, 8.0, 8.0, 8.0, 125.0, 1393.6767578125, 62.744140625], "isController": false}, {"data": ["Reporte Productos Vencidos", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 64.77864583333333], "isController": false}, {"data": ["Listar Aplicaciones", 1, 1, 100.0, 2.0, 2, 2, 2.0, 2.0, 2.0, 2.0, 500.0, 501.46484375, 91.30859375], "isController": false}, {"data": ["Consultar Stock", 1, 0, 0.0, 7.0, 7, 7, 7.0, 7.0, 7.0, 7.0, 142.85714285714286, 135.88169642857142, 71.2890625], "isController": false}, {"data": ["Registrar Abono Parcial", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 326.8229166666667, 92.12239583333333], "isController": false}, {"data": ["Listar Eventos Calendario", 1, 1, 100.0, 2.0, 2, 2, 2.0, 2.0, 2.0, 2.0, 500.0, 501.46484375, 92.7734375], "isController": false}, {"data": ["Compra a Credito", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 162.109375], "isController": false}, {"data": ["Reporte Inventario Actual", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 65.10416666666667], "isController": false}, {"data": ["Editar Campana", 1, 0, 0.0, 12.0, 12, 12, 12.0, 12.0, 12.0, 12.0, 83.33333333333333, 115.234375, 48.33984375], "isController": false}, {"data": ["Reporte Aplicaciones por Parcela", 1, 1, 100.0, 2.0, 2, 2, 2.0, 2.0, 2.0, 2.0, 500.0, 501.46484375, 101.5625], "isController": false}, {"data": ["Crear Usuario Agricultor", 1, 0, 0.0, 168.0, 168, 168, 168.0, 168.0, 168.0, 168.0, 5.952380952380952, 7.388160342261904, 3.6562965029761902], "isController": false}, {"data": ["Listar Campanas", 1, 0, 0.0, 12.0, 12, 12, 12.0, 12.0, 12.0, 12.0, 83.33333333333333, 233.47981770833331, 41.097005208333336], "isController": false}, {"data": ["Listar Compras", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 59.89583333333333], "isController": false}, {"data": ["Login Directiva", 2, 1, 50.0, 86.5, 3, 170, 86.5, 170.0, 170.0, 170.0, 2.8776978417266186, 4.014444694244605, 0.6660296762589929], "isController": false}, {"data": ["Login Admin", 6, 3, 50.0, 91.83333333333333, 3, 205, 86.0, 205.0, 205.0, 205.0, 4.491017964071856, 6.256286255613772, 1.0218820172155687], "isController": false}, {"data": ["Listar Usuarios", 1, 0, 0.0, 6.0, 6, 6, 6.0, 6.0, 6.0, 6.0, 166.66666666666666, 963.8671875, 81.54296875], "isController": false}, {"data": ["Desactivar Usuario", 1, 0, 0.0, 7.0, 7, 7, 7.0, 7.0, 7.0, 7.0, 142.85714285714286, 177.87388392857142, 79.52008928571428], "isController": false}, {"data": ["Listar Proveedores", 1, 1, 100.0, 2.0, 2, 2, 2.0, 2.0, 2.0, 2.0, 500.0, 501.46484375, 89.84375], "isController": false}, {"data": ["Me", 1, 0, 0.0, 7.0, 7, 7, 7.0, 7.0, 7.0, 7.0, 142.85714285714286, 187.22098214285714, 78.54352678571428], "isController": false}, {"data": ["Asignar Cultivo a Parcela", 1, 0, 0.0, 18.0, 18, 18, 18.0, 18.0, 18.0, 18.0, 55.55555555555555, 100.8029513888889, 37.05512152777778], "isController": false}, {"data": ["Editar Usuario", 1, 0, 0.0, 9.0, 9, 9, 9.0, 9.0, 9.0, 9.0, 111.1111111111111, 138.23784722222223, 64.6701388888889], "isController": false}, {"data": ["Reporte Cuentas por Pagar", 1, 1, 100.0, 3.0, 3, 3, 3.0, 3.0, 3.0, 3.0, 333.3333333333333, 334.3098958333333, 62.174479166666664], "isController": false}]}, function(index, item){
        switch(index){
            // Errors pct
            case 3:
                item = item.toFixed(2) + '%';
                break;
            // Mean
            case 4:
            // Mean
            case 7:
            // Median
            case 8:
            // Percentile 1
            case 9:
            // Percentile 2
            case 10:
            // Percentile 3
            case 11:
            // Throughput
            case 12:
            // Kbytes/s
            case 13:
            // Sent Kbytes/s
                item = item.toFixed(2);
                break;
        }
        return item;
    }, [[0, 0]], 0, summaryTableHeader);

    // Create error table
    createTable($("#errorsTable"), {"supportsControllersDiscrimination": false, "titles": ["Type of error", "Number of errors", "% in errors", "% in all samples"], "items": [{"data": ["400/Bad Request", 2, 7.142857142857143, 3.9215686274509802], "isController": false}, {"data": ["401/Unauthorized", 18, 64.28571428571429, 35.294117647058826], "isController": false}, {"data": ["404/Not Found", 2, 7.142857142857143, 3.9215686274509802], "isController": false}, {"data": ["429/Too Many Requests", 6, 21.428571428571427, 11.764705882352942], "isController": false}]}, function(index, item){
        switch(index){
            case 2:
            case 3:
                item = item.toFixed(2) + '%';
                break;
        }
        return item;
    }, [[1, 1]]);

        // Create top5 errors by sampler
    createTable($("#top5ErrorsBySamplerTable"), {"supportsControllersDiscrimination": false, "overall": {"data": ["Total", 51, 28, "401/Unauthorized", 18, "429/Too Many Requests", 6, "400/Bad Request", 2, "404/Not Found", 2, "", ""], "isController": false}, "titles": ["Sample", "#Samples", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors", "Error", "#Errors"], "items": [{"data": ["Inventario Global", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Listar Operaciones Sync", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Entrada de Stock", 1, 1, "400/Bad Request", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Compra Conjunta", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Compra al Contado", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Estado Sincronizacion", 1, 1, "404/Not Found", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Crear Proveedor", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Listar Cuentas Pendientes", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Ajuste de Inventario", 1, 1, "400/Bad Request", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Registrar Aplicacion", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Sincronizar Operaciones", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["Bitacora", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Login Agricultor", 3, 2, "429/Too Many Requests", 2, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["Reporte Productos Vencidos", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Listar Aplicaciones", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Registrar Abono Parcial", 1, 1, "404/Not Found", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Listar Eventos Calendario", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Compra a Credito", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Reporte Inventario Actual", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": ["Reporte Aplicaciones por Parcela", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["Listar Compras", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Login Directiva", 2, 1, "429/Too Many Requests", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": ["Login Admin", 6, 3, "429/Too Many Requests", 3, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["Listar Proveedores", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": [], "isController": false}, {"data": ["Reporte Cuentas por Pagar", 1, 1, "401/Unauthorized", 1, "", "", "", "", "", "", "", ""], "isController": false}]}, function(index, item){
        return item;
    }, [[0, 0]], 0);

});
