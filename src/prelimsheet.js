cellclass = "ps_cell"
cellselect= "ps_selected"
cellinfo  = "ps_info"
tableclass= "ps_table"
hashistory= "ps_hashistory"

function parseCellId(cellId) {
    let sheetName = null;
    let sheetIndex = null;
    let cellIdentifier = null;

    // Ellenőrizzük, hogy van-e kötőjel a cellId-ban
    const dashIndex = cellId.indexOf('-');

    if (dashIndex !== -1) {
        // Ha van kötőjel, akkor előtte van a sheet neve
        sheetName = cellId.slice(0, dashIndex);
        const remainingPart = cellId.slice(dashIndex + 1);

        // A kötőjel utáni első számok jelentik a sheet indexét, majd ezt követi a cella azonosító
        const match = remainingPart.match(/^(\d+)([A-Z]+\d+)$/);

        if (match) {
            sheetIndex = parseInt(match[1], 10); // Sheet index
            cellIdentifier = match[2]; // Cella azonosító
        } else {
            throw new Error("Invalid cellId format: " + cellId);
        }
    } else {
        // Ha nincs kötőjel, akkor csak sheet index és cellaazonosító lehet, vagy csak cellaazonosító
        const match = cellId.match(/^(\d+)?([A-Z]+\d+)$/);

        if (match) {
            sheetIndex = match[1] ? parseInt(match[1], 10) : null;
            cellIdentifier = match[2]; // Cella azonosító
        } else {
            throw new Error("Invalid cellId format: " + cellId);
        }
    }

    // A cellIdentifier feldolgozása a toIndex függvénnyel
    const [col, row] = toIndex(cellIdentifier);

    return [col, row, sheetIndex];
}


function index2ColumnName(index) {
    let columnName = '';
    let remainder;
    while (index >= 0) {
        remainder = index % 26;
        columnName = String.fromCharCode(65 + remainder) + columnName;
        index = Math.floor(index / 26) - 1;
    }
    return columnName;
}
/*
console.log(index2ColumnName(0));   // A
console.log(index2ColumnName(30));  // AE
console.log(index2ColumnName(702)); // AAA
*/
function columnName2Index(columnName) {
    let index = 0;
    let i = 0;

    // Iterate over the characters in the column part (letters)
    while (i < columnName.length && isNaN(columnName[i])) {
        index = index * 26 + (columnName.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
        i++;
    }

    // If there are numbers following the column letters, return the index minus one
    const rowNumber = columnName.slice(i) !== '' ? parseInt(columnName.slice(i), 10) : null;
    
    // Return both column index (zero-based) and row number (one-based)
    return rowNumber !== null ? [index - 1, rowNumber - 1] : index - 1;
}

/* Példák használatra:
console.log(columnName2Index("A"));       // 0
console.log(columnName2Index("AE"));      // 30
console.log(columnName2Index("AA64"));    // [26, 63] - Az AA a 26. oszlop, és a 64. sor (zero-based 63)
*/

function toIndex(cellName) {
    const [colIndex, rowIndex] = columnName2Index(cellName);
    return [colIndex, rowIndex];
}

/* Példák használatra:
console.log(toIndex("A1"));    // [0, 0]
console.log(toIndex("B2"));    // [1, 1]
console.log(toIndex("AC45"));  // [28, 44]
console.log(toIndex("Z100"));  // [25, 99]
*/
function toCellName(indices) {
    const [colIndex, rowIndex] = indices;
    const columnName = index2ColumnName(colIndex);
    const rowName = (rowIndex + 1).toString();
    return columnName + rowName;
}

/* Példák használatra:
console.log(toCellName([0, 0]));    // A1
console.log(toCellName([1, 1]));    // B2
console.log(toCellName([28, 44]));  // AC45
console.log(toCellName([25, 99]));  // Z100
*/

class TPRELIMSHEET {
    constructor(workbookname,domid=null) {
        this.name = workbookname;
        if (domid==null)
            this.DOM = document.currentScript.parentElement; 
        else 
            this.DOM =document.getElementById(domid);
        this.data = [];
        this.selected = null; // [0,"B4"] // sheetindex, cellname 
        this.username = ""; // Felhasználói név
        this.userroles = []; // Felhasználói szerepkörök        
        this.currentSheetIndex = 0; // Az aktuálisan megjelenített sheet indexe
        this.combos = {}; // Combo template-ek tárolására szolgáló objektum
        this.isEdit = false;
        this.lastColor = '#000000'; // Globális utolsó használt szín
        this.lastBackgroundColor = '#ffffff'; // Globális utolsó használt háttérszín        
        this.styleManager = new StyleManager();
        // Létrehozunk egy külön div-et a fülek számára
        this.tabsDiv = document.createElement('div');
        this.tabsDiv.className = 'tabs-container';
        this.DOM.appendChild(this.tabsDiv); // Hozzáadjuk a fő DOM elemhez
                
        document.addEventListener('keydown', (event) => {
            if (!this.isEdit){
                if (this.selected) {
                    switch (event.key) {
                        case 'ArrowUp':
                            this.moveSelection(-1, 0);
                            event.preventDefault();
                            break;
                        case 'ArrowDown':
                            this.moveSelection(1, 0);
                            event.preventDefault();
                            break;
                        case 'ArrowLeft':
                            this.moveSelection(0, -1);
                            event.preventDefault();
                            break;
                        case 'ArrowRight':
                            this.moveSelection(0, 1);
                            event.preventDefault();
                            break;
                        case 'F2':
                            this.selected.editCell(); // Trigger edit mode on the selected cell
                            event.preventDefault();
                            break;                  
                        case 'F3':
                            this.selected.showInfoModal(); // Trigger edit mode on the selected cell
                            event.preventDefault();
                            break;                  
                        case 'F4':
                            this.selected.showHistoryModal(); // Trigger edit mode on the selected cell
                            event.preventDefault();
                            break;                  
    
                        }
                }
            }
        });  

        this.onEditStart = null;
        this.onEditEnd = null;
        this.onCellFocus = null;
        this.onchange = null; // Az onchange eseménykezelő
        this.onsave = null;   // Az onsave eseménykezelő
        this.onload = null;   // Az onload eseménykezelő        
    }

    moveSelection(rowOffset, colOffset) {
        //const sheet = this.data[0]; // Assuming a single sheet for now
        const [col, row,sheetindex] = parseCellId(this.selected.TD.id); // Parse the selected cell's ID
        const sheet = this.data[sheetindex-1]
        const newRow = row + rowOffset;
        const newCol = col + colOffset;

        if (newRow >= 0 && newRow < sheet.datarow.length && newCol >= 0 && newCol < sheet.datacol.length) {
            const newCell = sheet.datarow[newRow].datacell[newCol];
            this.selected.setClass(cellclass);
            this.selected.removeClass(cellselect);
            newCell.setClass(cellselect);
            this.selected = newCell;
            if (typeof this.onCellFocus === 'function') {
                this.onCellFocus(newCell); // Eseményhívás, amikor a cella kiválasztásra kerül
            }
        }
    }

    // Combótípus hozzáadása a template listához
    addComboTemplate(name, options) {
        this.combos[name] = options;
    }

    // Combo típus lekérése név alapján
    getComboTemplate(name) {
        return this.combos[name] || null;
    }    

    // Sheet megjelenítése index, név vagy TSHEET objektum alapján
    showSheet(param) {
        let sheet;

        if (typeof param === 'number') {
            // Ha numerikus adat, akkor index szerinti keresés
            if (param < 0 || param >= this.data.length) {
                throw new Error("Invalid sheet index");
            }
            sheet = this.data[param];
        } else if (typeof param === 'string') {
            // Ha szöveges adat, akkor név szerinti keresés
            sheet = this.data.find(sh => sh.name === param);
            if (!sheet) {
                throw new Error("Sheet with name '" + param + "' not found");
            }
        } else if (param instanceof TSHEET) {
            // Ha TSHEET objektum, akkor az adott sheetet használjuk
            sheet = param;
        } else {
            throw new Error("Invalid parameter type");
        }

        // Az aktuális sheet DOM elemének elrejtése
        if (this.currentSheetIndex !== null) {
            this.data[this.currentSheetIndex].DOMDIV.style.display = 'none';
        }

        // Az új sheet DOM elemének megjelenítése
        this.currentSheetIndex = this.data.indexOf(sheet);
        sheet.DOMDIV.style.display = 'block';

        // Frissítjük a füleket
        this.updateTabs();        
    }

    updateTabs() {
        this.tabsDiv.innerHTML = ''; // Töröljük a régi füleket

        this.data.forEach((sheet, index) => {
            const tab = document.createElement('button');
            tab.className = 'tab-button ';
            tab.textContent = sheet.name;
            if (index === this.currentSheetIndex) {
                tab.classList.add('active-tab');
            }

            tab.addEventListener('click', () => {
                this.showSheet(index);
            });

            this.tabsDiv.appendChild(tab);
        });
    }

    addSheets(num) {
        for (let i = 0; i < num; i++) {
            const sheet = new TSHEET(this);
            this.data.push(sheet);
        }
        this.updateTabs(); // Frissítjük a füleket
        return this.data
    }

    // Sheet hozzáadása
    addSheet(name) {
        const sheet = new TSHEET(this, name);
        this.data.push(sheet);

        // Alapértelmezésben elrejtjük az új sheetet
        if (this.data.length > 1) {
            sheet.DOMDIV.style.display = 'none';
        }
        this.updateTabs(); // Frissítjük a füleket
        return sheet;
    }    

    // getSheet by index or name
    getSheet(param) {
        if (typeof param === 'number') {
            // Ha numerikus adat, akkor index szerinti keresés
            if (param < 0 || param >= this.data.length) {
                return null; // Érvénytelen index esetén null értéket adunk vissza
            }
            return this.data[param];
        } else if (typeof param === 'string') {
            // Ha szöveges adat, akkor név szerinti keresés
            return this.data.find(sh => sh.name === param) || null;
        } else {
            // Ha a paraméter típusa nem string vagy number, akkor null értéket adunk vissza
            return null;
        }
    }    

    getCellDOM(cellId) {
        const [col, row,sheet] = parseCellId(cellId);
        return this.getCellDOMByIndex(col, row);
    }

    getCellDOMByIndex(colIndex, rowIndex) {
        const sheet = this.data[0];
        return sheet.datarow[rowIndex].datacell[colIndex].TD;
    }

    setUser(username, roles) {
        this.username = username;
        this.userroles = roles;
    
        // Frissíti az összes cellát az aktuális sheet-ben
        this.data.forEach(sheet => {
            sheet.datarow.forEach(row => {
                row.datacell.forEach(cell => {
                    cell.updateRoleState();
    
                    // Frissíti a kiválasztás állapotát is
                    if (cell.selected) {
                        cell.setClass(cellselect);
                    } else {
                        cell.removeClass(cellselect);
                    }
                });
            });
        });
    }
}

TPRELIMSHEET.prototype.loadcsv = function(csvcontent, sheetindex = null, override = false) {
    const spreadsheet3 = this;
    // CSV feldolgozása: sorokra bontás
    const rows = csvcontent.split('\n').map(row => row.split(','));

    // Meghatározni a sorok és oszlopok számát
    const numRows = rows.length;
    const numCols = Math.max(...rows.map(row => row.length));

    let sheet;
    if (sheetindex === null) {
        // Ha sheetindex null, akkor új sheet létrehozása
        sheet = this.addSheet(`Sheet${this.data.length + 1}`);
    } else {
        // Meglévő sheet kiválasztása
        sheet = this.data[sheetindex];
    }

    // Sheet méretének beállítása a CSV adatok alapján, ha nincs override
    if (!override) {
        sheet.setSize(numRows, numCols);
    }

    // Cellák kitöltése a CSV tartalmával
    rows.forEach((row, rowIndex) => {
        row.forEach((cellValue, colIndex) => {
            const cellName = toCellName([colIndex, rowIndex]);
            sheet.setCellValue(cellName, cellValue.trim());
        });
    });

    if (typeof spreadsheet3.onload === 'function') {
        spreadsheet3.onload(spreadsheet3, sheet); // Eseményhívás betöltéskor
    }
};


/*<script src="xlsx.js"></script>*/
TPRELIMSHEET.prototype.loadExcel = function(file, override = false,overrideuser=true) {
    const spreadsheet3 = this;
    const reader = new FileReader();
    if (overrideuser){
        spreadsheet3.setUser(file.name,"user");
    }

    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellStyles: true });

        workbook.SheetNames.forEach(function(sheetName) {
            let sheet;
            let isAdd=false;

            if (override) {
                // Ha override, akkor megpróbáljuk megkeresni a létező sheetet név alapján
                sheet = spreadsheet3.getSheet(sheetName);
                if (!sheet) {
                    // Ha nem található, akkor létrehozzuk
                    sheet = spreadsheet3.addSheet(sheetName);
                    isAdd=true;
                }
            } else {
                // Ha nincs override, akkor új sheet létrehozása
                sheet = spreadsheet3.addSheet(sheetName);
                isAdd=true;
            }

            const worksheet = workbook.Sheets[sheetName];
            const range = XLSX.utils.decode_range(worksheet['!ref']); // Teljes tartomány lekérése

            // Sheet méretének beállítása a CSV adatok alapján, ha nincs override
            if (isAdd) {
                sheet.setSize(range.e.r + 1, range.e.c + 1); // Méretezés a teljes tartomány alapján
            }

            for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex++) {
                for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex++) {
                    const cellAddress = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex });
                    const cell = worksheet[cellAddress];

                    if (cell) {
                        const cellName = toCellName([colIndex, rowIndex]);
                        if (cell.v == null) cell.v="";
                        sheet.setCellValue(cellName,cell.v);
                        //const cellDOM = sheet.getCell(cellName);
                        //cellDOM.setValue(cell.v); // Cell value beállítása

                        // Stílusindex alapján formázás lekérése és alkalmazása
                        if (cell.s) {
                            const styleIndex = cell.s;
                            const style = workbook.Styles.CellXf[styleIndex];

                            if (style) {
                                // Szöveg igazítása
                                if (style.alignment) {
                                    if (style.alignment.horizontal) {
                                        cellDOM.TD.style.textAlign = style.alignment.horizontal;
                                    }
                                    if (style.alignment.vertical) {
                                        cellDOM.TD.style.verticalAlign = style.alignment.vertical;
                                    }
                                }

                                // Betűszín és háttérszín alkalmazása
                                if (style.font && style.font.color && style.font.color.rgb) {
                                    cellDOM.TD.style.color = `#${style.font.color.rgb.slice(2)}`;
                                }

                                if (style.fill && style.fill.fgColor && style.fill.fgColor.rgb) {
                                    cellDOM.TD.style.backgroundColor = `#${style.fill.fgColor.rgb.slice(2)}`;
                                }

                                // Betűtípus, vastagság és egyéb jellemzők
                                if (style.font) {
                                    if (style.font.bold) {
                                        cellDOM.TD.style.fontWeight = 'bold';
                                    }
                                    if (style.font.italic) {
                                        cellDOM.TD.style.fontStyle = 'italic';
                                    }
                                    if (style.font.sz) {
                                        cellDOM.TD.style.fontSize = `${style.font.sz}pt`;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Ha override volt, akkor nem szükséges megjeleníteni az új sheetet, mert már létezett
            if (!override) {
                spreadsheet3.showSheet(spreadsheet3.data.length - 1);
            }

            if (typeof spreadsheet3.onload === 'function') {
                spreadsheet3.onload(spreadsheet3, null); // Eseményhívás betöltéskor
            }
        });
    };

    reader.readAsArrayBuffer(file);
};


TPRELIMSHEET.prototype.convertToJson = function() {
    const json = {
        head: {
            combos: this.combos,           
            styles: this.styleManager.styles    
        },
        sheets: []                         
    };

    this.data.forEach(sheet => {
        const sheetData = {
            name: sheet.name,                
            size: [sheet.rownum(), sheet.colnum()],  
            cells: [],                       
            columns: [],                     
            rows: []                         
        };

        let previousCol = null;
        let colCount = 0;

        sheet.datacol.forEach(col => {
            const colData = {
                index: col.colindex,
                width: col.width,
                lastUsedColor: col.lastUsedColor, 
                lastUsedBackgroundColor: col.lastUsedBackgroundColor 
            };

            if (previousCol && 
                previousCol.width === colData.width && 
                previousCol.lastUsedColor === colData.lastUsedColor && 
                previousCol.lastUsedBackgroundColor === colData.lastUsedBackgroundColor) {
                
                colCount++;
            } else {
                if (previousCol) {
                    previousCol.count = colCount;
                    sheetData.columns.push(previousCol);
                }
                previousCol = { ...colData };
                colCount = 1;
            }
        });

        if (previousCol) {
            previousCol.count = colCount;
            sheetData.columns.push(previousCol);
        }

        let previousRow = null;
        let rowCount = 0;

        sheet.datarow.forEach((row, rowIndex) => {
            const rowData = {
                index: row.name,
                height: row.height,
                lastUsedColor: row.lastUsedColor, 
                lastUsedBackgroundColor: row.lastUsedBackgroundColor 
            };

            if (previousRow && 
                previousRow.height === rowData.height && 
                previousRow.lastUsedColor === rowData.lastUsedColor && 
                previousRow.lastUsedBackgroundColor === rowData.lastUsedBackgroundColor) {
                
                rowCount++;
            } else {
                if (previousRow) {
                    previousRow.count = rowCount;
                    sheetData.rows.push(previousRow);
                }
                previousRow = { ...rowData };
                rowCount = 1;
            }
        });

        if (previousRow) {
            previousRow.count = rowCount;
            sheetData.rows.push(previousRow);
        }

        sheet.datarow.forEach((row, rowIndex) => {
            row.datacell.forEach((cell, colIndex) => {
                const cellData = {
                    id: `${index2ColumnName(colIndex)}${rowIndex + 1}`,  
                    value: cell.getValue(),   
                    styleIndex: cell.styleIndex,  
                    type: cell.celltype,      
                    comboTemplateName: cell.comboTemplateName,  
                    readonly: cell.readonly,  
                    role: cell.role,          
                    info: cell.info,
                    history: cell.history      // History adatok hozzáadása
                };

                // Ellenőrizzük, hogy a cella nem üres-e, azaz van-e bármilyen hasznos adat
                if (cellData.value !== "" || cellData.styleIndex !== null || cellData.type !== _CellTypes.NONE || 
                    cellData.comboTemplateName !== null || cellData.readonly || cellData.role.length > 0 || 
                    cellData.info !== "" || cellData.history.length > 0) {  // History ellenőrzése is
                    sheetData.cells.push(cellData);
                }
            });
        });

        json.sheets.push(sheetData);
    });

    const jsonString = JSON.stringify(json, null, 4);
    return jsonString;
};


TPRELIMSHEET.prototype.saveToFile = function(filename, data) {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

TPRELIMSHEET.prototype.csvFromFile = function(file,sheetindex=null,override=false) {
    const spreadsheet = this;
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const csvContent = event.target.result;
        spreadsheet.loadcsv(csvContent,sheetindex,override);
    };
    
    reader.readAsText(file);
};

TPRELIMSHEET.prototype.loadFromFile = function(file) {
    const spreadsheet = this;
    const reader = new FileReader();
    
    reader.onload = function(event) {
        const jsonString = event.target.result;
        spreadsheet.convertFromJson(jsonString);
    };
    
    reader.readAsText(file);
};

TPRELIMSHEET.prototype.convertFromJson = function(jsonString) {
    const jsonData = JSON.parse(jsonString);
    this.clearAll(false);

    if (jsonData.head.combos) {
        for (const [name, options] of Object.entries(jsonData.head.combos)) {
            this.addComboTemplate(name, options);
        }
    }

    if (jsonData.head.styles) {
        this.styleManager.styles = jsonData.head.styles;
    }

    jsonData.sheets.forEach(sheetData => {
        const sheet = this.addSheet(sheetData.name);
        sheet.setSize(sheetData.size[0], sheetData.size[1]);

        sheetData.columns.forEach(col => {
            const colCount = col.count || 1;
            for (let i = 0; i < colCount; i++) {
                const colObj = sheet.datacol[col.index + i];
                colObj.setWidth(col.width);
                colObj.lastUsedColor = col.lastUsedColor || '#000000'; 
                colObj.lastUsedBackgroundColor = col.lastUsedBackgroundColor || '#ffffff'; 
            }
        });

        sheetData.rows.forEach(row => {
            const rowCount = row.count || 1;
            for (let i = 0; i < rowCount; i++) {
                const rowObj = sheet.datarow[row.index - 1 + i];
                rowObj.setHeight(row.height);
                rowObj.lastUsedColor = row.lastUsedColor || '#000000'; 
                rowObj.lastUsedBackgroundColor = row.lastUsedBackgroundColor || '#ffffff'; 
            }
        });

        sheetData.cells.forEach(cellData => {
            const cell = sheet.getCell(cellData.id);
            cell.setValue(cellData.value);
            if (cellData.styleIndex !== null) {
                cell.applyStyleByIndex(cellData.styleIndex);
            }
            cell.celltype = cellData.type || _CellTypes.NONE;
            cell.comboTemplateName = cellData.comboTemplateName || null;
            cell.readonly = cellData.readonly || false;
            cell.role = cellData.role || [];
            cell.info = cellData.info || "";
            cell.history = cellData.history || [];  // History adatok visszaállítása

            // History osztály hozzáadása, ha szükséges
            cell.addHistoryClass();

            // Frissítjük a role alapú osztályokat (classes)
            cell.updateRoleState();

            // Frissítjük a readonly állapotot is a DOM class alapján
            if (cell.readonly) {
                cell.setClass('ps_readonly');
            } else {
                cell.removeClass('ps_readonly');
            }

            cell.showInfo(cellData.info ? true : false);
        });
    });

    this.showSheet(0);
};

TPRELIMSHEET.prototype.clearAll = function(withuser=true) {
    // Táblázat adatainak törlése
    this.data.forEach(sheet => {
        if (sheet.DOMDIV && sheet.DOMDIV.parentElement) {
            sheet.DOMDIV.parentElement.removeChild(sheet.DOMDIV);
        }
    });
    this.data = [];

    // Kombó sablonok törlése
    this.combos = {};

    // Stílusok törlése
    this.styleManager = new StyleManager();

    // Kiválasztott cella alaphelyzetbe állítása
    this.selected = null;

    // Az aktuális sheet indexének alaphelyzetbe állítása
    this.currentSheetIndex = 0;

    if (withuser){
        // Felhasználói adatok alaphelyzetbe állítása
        this.username = "";
        this.userroles = [];
    }
    // Fülek frissítése (mivel nincs sheet, ez üres lesz)
    this.updateTabs();
};


TPRELIMSHEET.prototype.clearHistory = function() {
    this.data.forEach(sheet => {
        sheet.clearSheetHistory();
    });
};

TPRELIMSHEET.prototype.consolidateHistory = function() {
    this.data.forEach(sheet => {
        sheet.consolidateSheetHistory();
    });
};



class TSHEET {
    constructor(parent, name = '') {
        this.parent = parent;
        this.DOMDIV = null;
        this.name = name;
        this.datarow = []; //TROW
        this.datacol = []; //TCOL
        this.create(parent);
    }

    rownum(){
        return this.datarow.length;
    }
    colnum(){
        return this.datacol.length
    }

    create(parent) {
        this.DOMDIV = document.createElement('table');
        this.DOMDIV.className = tableclass;
        parent.DOM.appendChild(this.DOMDIV);
        //this.createHeaders();
    }

    unhideAllRows() {
        this.datarow.forEach(row => {
            row.setVisible(true);
        });
    }
    
    area(value) {
        const totalRows = this.rownum();
        const totalCols = this.colnum();
    
        let x1 = 0, y1 = 0, x2 = totalCols - 1, y2 = totalRows - 1;
    
        if (value === "") {
            return [x1, y1, x2, y2];
        }
    
        // Oszlopnévre vagy cellára utaló formátum ('A', 'A1', 'A:C', 'A5:C7')
        const colMatch = value.match(/([A-Z]+)?(\d+)?(:([A-Z]+)?(\d+)?)?/);
    
        // Sorra utaló formátum ('2', '2:5')
        const rowMatch = value.match(/^(\d+)(:(\d+))?$/);
    
        if (rowMatch) {
            // Ha egy sor vagy sortartomány van megadva, pl. '2', '2:5'
            const [, rowStart, , rowEnd] = rowMatch;
            y1 = parseInt(rowStart, 10) - 1;
            y2 = rowEnd ? parseInt(rowEnd, 10) - 1 : y1;
            x1 = 0;
            x2 = totalCols - 1;
        } else if (colMatch) {
            const [, col1, row1, , col2, row2] = colMatch;
    
            // Ha csak egy oszlop van megadva, pl. 'A'
            if (col1 && !row1 && !col2 && !row2) {
                x1 = toIndex(col1 + '1')[0];
                x2 = x1;
                y1 = 0;
                y2 = totalRows - 1;
            }
    
            // Ha egy cella van megadva, pl. 'A1'
            if (col1 && row1 && !col2 && !row2) {
                [x1, y1] = toIndex(col1 + row1);
                x2 = x1;
                y2 = y1;
            }
    
            // Ha egy oszloptartomány van megadva, pl. 'A:C'
            if (col1 && !row1 && col2 && !row2) {
                x1 = toIndex(col1 + '1')[0];
                x2 = toIndex(col2 + '1')[0];
                y1 = 0;
                y2 = totalRows - 1;
            }
    
            // Ha egy cellatartomány van megadva, pl. 'A5:C7'
            if (col1 && row1 && col2 && row2) {
                [x1, y1] = toIndex(col1 + row1);
                [x2, y2] = toIndex(col2 + row2);
            }
        } else {
            throw new Error("Invalid area format");
        }
    
        return [x1, y1, x2, y2];
    }
    
    

    setCellType(celltype, area = "") {
        // Meghatározzuk az érintett területet az area függvénnyel
        const [x1, y1, x2, y2] = this.area(area);

        // Végigmegyünk a területen, és beállítjuk a cella típusát
        for (let rowIndex = y1; rowIndex <= y2; rowIndex++) {
            for (let colIndex = x1; colIndex <= x2; colIndex++) {
                const cell = this.datarow[rowIndex].datacell[colIndex];
                cell.celltype = celltype;
            }
        }
    }
    setCellByPos(x1, y1, x2, y2,func) {
        // Végigmegyünk a területen, és beállítjuk a cella típusát
        for (let rowIndex = y1; rowIndex <= y2; rowIndex++) {
            for (let colIndex = x1; colIndex <= x2; colIndex++) {
                const cell = this.datarow[rowIndex].datacell[colIndex];
                func(cell)                
            }
        }
    }
    setCell(area = "",func) {
        // Meghatározzuk az érintett területet az area függvénnyel
        const [x1, y1, x2, y2] = this.area(area);
        this.setCellByPos(x1,y1,x2,y2,func);
    }

    setCellReadonly(yes, area = "") {
        // Meghatározzuk az érintett területet az area függvénnyel
        const [x1, y1, x2, y2] = this.area(area);

        // Végigmegyünk a területen, és beállítjuk a cella típusát
        for (let rowIndex = y1; rowIndex <= y2; rowIndex++) {
            for (let colIndex = x1; colIndex <= x2; colIndex++) {
                const cell = this.datarow[rowIndex].datacell[colIndex];
                cell.readOnly(yes);
            }
        }
    }    
    

    addRows(num) {
        const currentRowCount = this.rownum();
        for (let i = 0; i < num; i++) {
            const row = new TROW(this, currentRowCount + i + 1); // Folytatjuk a sorszámozást
            this.datarow.push(row);
        }
    }
    
    addCols(num) {
        const currentColCount = this.colnum();
        for (let i = 0; i < num; i++) {
            const col = new TCOL(this, currentColCount + i); // Folytatjuk az oszlopszámozást
            this.datacol.push(col);
            this.datarow.forEach(row => {
                row.addCells(1); // Hozzáadunk egy cellát az új oszlophoz minden sorban
            });
        }
    }

    setSize(rows, cols) {
        const sheet = this;
        const numrows = rows - sheet.rownum();
        const numcols = cols - sheet.colnum();
        if (numrows > 0) sheet.addRows(numrows);
        if (numcols > 0) sheet.addCols(numcols);
    }

    setCellValue(cellId, value, valuetype = "string") {
        const [col, row, sheet] = parseCellId(cellId);
        
        // Ellenőrizzük, hogy a sor- és oszlopindexek túllépik-e a tábla aktuális méretét
        if (row >= this.datarow.length) {
            // Ha a sorindex túllépi a meglévő sorok számát, bővítjük a sorokat
            const rowsToAdd = row - this.datarow.length + 1;
            this.addRows(rowsToAdd);
        }
    
        if (col >= this.datacol.length) {
            // Ha az oszlopindex túllépi a meglévő oszlopok számát, bővítjük az oszlopokat
            const colsToAdd = col - this.datacol.length + 1;
            this.addCols(colsToAdd);
        }
    
        const cell = this.datarow[row].datacell[col];
        cell.setValue(value);
        cell.valuetype = valuetype;
    }

    setColWidth(colName, width) {
        const colIndex = colName.charCodeAt(0) - 'A'.charCodeAt(0);
        const col = this.datacol[colIndex];
        col.setWidth(width);
    }

    setRowHeight(rowName, height) {
        const rowIndex = parseInt(rowName) - 1;
        const row = this.datarow[rowIndex];
        row.setHeight(height);
    }

    getCell(cellId) {
        const [col, row,sheet] = parseCellId(cellId);
        return this.datarow[row].datacell[col];
    }    
}

TSHEET.prototype.clearSheetHistory = function() {
    this.datarow.forEach(row => {
        row.datacell.forEach(cell => {
            cell.clearCellHistory();
        });
    });
};

TSHEET.prototype.consolidateSheetHistory = function() {
    this.datarow.forEach(row => {
        row.datacell.forEach(cell => {
            cell.consolidateCellHistory();
        });
    });
};


class TROW {
    constructor(sheet, name) {
        this.sheet = sheet;
        this.DOMTR = null;
        this.name = name; // pl "14"
        this.selected = false;
        this.datacell = [];
        this.height = 30;
        this.visible = true;
        this.lastUsedColor = '#000000'; // Alapértelmezett szín
        this.create(sheet.DOMDIV, sheet);
    }

    create(DOMDIV, sheet) {        
        this.DOMTR = document.createElement('tr');
        DOMDIV.appendChild(this.DOMTR);
    
        // Create the row header cell (1, 2, 3, ...)
        const rowHeaderCell = document.createElement('th');
        rowHeaderCell.className="sticky-first-col";
        rowHeaderCell.textContent = this.name; // Convert zero-based index to 1-based

        // Kontextusmenü megjelenítése bal egérgombbal történő kattintásra
        rowHeaderCell.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const options = [
                { label: 'Hide', action: (target) => target.setVisible(false) },
                { label: 'Remove Formats', action: (target) => target.setStyle('') },
                { label: 'Color', action: (target) => applyColor(target, 'color') },
                { label: 'BgColor', action: (target) => applyColor(target, 'background-color') },
                { label: 'Paste Color', action: (target) => target.applyColorToElement('color', this.sheet.parent.lastColor) },
                { label: 'Paste BgColor', action: (target) => target.applyColorToElement('background-color', this.sheet.parent.lastBackgroundColor) },                
                {
                    label: 'ALIGN',
                    submenu: [
                        { label: 'Wrap Text', action: (target) => applyTextAlignment(target, 'wrap') },
                        { label: 'Clip Text', action: (target) => applyTextAlignment(target, 'clip') },
                    ]
                },
                {
                    label: 'INPUT',
                    submenu: [
                        { label: 'NONE', action: (target) => target.setCellType(_CellTypes.NONE) },
                        { label: 'TEXT', action: (target) => target.setCellType(_CellTypes.TEXT) },
                        { label: 'IMAGE', action: (target) => target.setCellType(_CellTypes.IMAGELINK) },
                        { label: 'COMBOBOX', action: (target) => target.setCellType(_CellTypes.COMBOBOX) },
                    ]
                }
            ];
            showContextMenu(event, this , options);
        });
    
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ps_row-resize-handle';
        rowHeaderCell.appendChild(resizeHandle);
    
        resizeHandle.addEventListener('mousedown', (event) => this.startRowResize(event));
    
        this.DOMTR.appendChild(rowHeaderCell);
    
        this.addCells(sheet.colnum());
    }

    applyStyleToElement(styleString) {
        this.datacell.forEach(cell => {
            cell.setStyle(styleString);
        });
    }
    applyColorToElement(type, color) {
        this.datacell.forEach(cell => {
            _updateCellStyle(cell, type, color);
        });
    }
    removeFormatsFromRow() {
        this.datacell.forEach(cell => {
            cell.setStyle("");  // Törli az összes formázást a sor celláiról
        });
    }    
    
    setVisible(visible) {
        this.visible = visible;
        if (visible) {
            this.DOMTR.style.display = '';            
        } else {
            this.DOMTR.style.display = 'none';
        }
    }

    startRowResize(event) {
        event.preventDefault();
        const startY = event.clientY;
        const startHeight = this.height;
    
        const onMouseMove = (moveEvent) => {
            const newHeight = startHeight + (moveEvent.clientY - startY);
            this.setHeight(newHeight);
        };
    
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    

    addCells(num) {
        const starti = this.datacell.length;
        for (let i = 0; i < num; i++) {
            const cell = new TCELL(this.sheet.DOMDIV, this.sheet, this, starti + i);
            this.datacell.push(cell);
        }
    }

    select(isSelected) {
        this.selected = isSelected;
        this.datacell.forEach(cell => cell.select(isSelected));
    }

    setHeight(px) {
        this.DOMTR.style.minHeight = `${px}px`;
        this.DOMTR.style.maxHeight = `${px}px`;
        this.DOMTR.style.height = `${px}px`;
        this.height = px;
    }
    setCellType(celltype) {
        this.datacell.forEach(cell => {
            cell.setCellType(celltype);
        });
    }    
}


const _HistoryTypes = {
    NONE:0,
    ALL: 10,
    CHANGED: 20
};

class TCOL {
    constructor(sheet,colindex) {
        this.sheet = sheet;
        this.colindex=colindex;
        this.name = index2ColumnName(this.colindex);
        this.selected = false;
        this.width=170;    
        this.lastUsedColor = '#000000'; 
        this.lastUsedBackgroundColor = '#ffffff';
        this.hasHistory = _HistoryTypes.NONE;
        this.createHeaders();  
    }

    createHeaders() {
        let i = this.colindex;
        // Create the header row (A, B, C, ...)
        const headerRow = document.createElement('tr');
        const emptyHeaderCell = document.createElement('th');
        emptyHeaderCell.className="sticky-first-row";
        emptyHeaderCell.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const options = [
                { label: 'UnHide All Rows', action: (target) => target.sheet.unhideAllRows() },
            ];
            showContextMenu(event, this, options);
        });
        headerRow.appendChild(emptyHeaderCell); // Empty top-left corner
    
        const th = document.createElement('th');
        th.className="sticky-first-row";
        th.textContent = index2ColumnName(i); // A, B, C, ...

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ps_col-resize-handle';
        th.appendChild(resizeHandle);

        resizeHandle.addEventListener('mousedown', (event) => this.startColResize(event, i));
        th.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const options = [
                {
                    label: 'FILTER',
                    submenu: [
                        { label: 'UnHide All Rows', action: (target) => target.sheet.unhideAllRows() },
                        { label: 'Filter Empty', action: (target) => target.filterRowsByEmpty(true) },
                        { label: 'Filter NonEmpty', action: (target) => target.filterRowsByEmpty(false) },      
                        { label: 'Filter Has history', action: (target) => target.applyFilterByHistory(true) },  // Új menüpont
                        { label: 'Filter Has no history', action: (target) => target.applyFilterByHistory(false) },  // Új menüpont                                
                        { label: 'Filter disable', action: (target) => target.clearFilter() },  
                    ]
                },
                { label: 'Remove Formats', action: (target) => target.setStyle('') },
                { label: 'Color', action: (target) => applyColor(target, 'color') },
                { label: 'BackGroundColor', action: (target) => applyColor(target, 'background-color') },
                { label: 'Paste Color', action: (target) => target.applyColorToElement('color', this.sheet.parent.lastColor) },
                { label: 'Paste BgColor', action: (target) => target.applyColorToElement('background-color', this.sheet.parent.lastBackgroundColor) },
                {
                    label: 'ALIGN',
                    submenu: [
                        { label: 'Wrap Text', action: (target) => applyTextAlignment(target, 'wrap') },
                        { label: 'Clip Text', action: (target) => applyTextAlignment(target, 'clip') },
                    ]
                },
                {
                    label: 'INPUT',
                    submenu: [
                        { label: 'NONE', action: (target) => target.setCellType(_CellTypes.NONE) },
                        { label: 'TEXT', action: (target) => target.setCellType(_CellTypes.TEXT) },
                        { label: 'IMAGE', action: (target) => target.setCellType(_CellTypes.IMAGELINK) },
                        { label: 'COMBOBOX', action: (target) => target.setCellType(_CellTypes.COMBOBOX) },
                    ]
                },
                {
                    label: 'History',
                    submenu: [
                        { label: 'All', action: (target) => target.setHistory(_HistoryTypes.ALL) },
                        { label: 'Changed only', action: (target) => target.setHistory(_HistoryTypes.CHANGED) },
                        { label: 'Off', action: (target) => target.setHistory(_HistoryTypes.NONE) },
                    ]
                }
            ];
            showContextMenu(event, this, options);
        });

        headerRow.appendChild(th);
        if (this.colindex==0)
            this.sheet.DOMDIV.insertBefore(headerRow,this.sheet.DOMDIV.childNodes[0])
        else {
            this.sheet.DOMDIV.childNodes[0].appendChild(th)
        }
        //this.sheet.DOMDIV.insert   appendChild(headerRow);

    }
    
    setHistory(typ=_HistoryTypes.CHANGED){
        this.sheet.datacol[this.colindex].hasHistory=typ;
    }

    applyStyleToElement(styleString) {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            cell.setStyle(styleString);
        });
    }

    applyColorToElement(type, color) {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            _updateCellStyle(cell, type, color);
        });
    }

    removeFormatsFromColumn() {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            cell.setStyle("");  // Törli az összes formázást
        });
    }

    // cellák history szűrésére
    applyFilterByHistory(on) {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            if (on) {
                row.setVisible(cell.history.length > 0);
            } else {
                row.setVisible(cell.history.length === 0);
            }
        });
    }
    
    filterRowsByEmpty(isEmpty) {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            const value = cell.getValue().trim();
            if (isEmpty) {
                // Filter Empty: Hide rows where cell is non-empty
                row.setVisible(value === '');
            } else {
                // Filter NonEmpty: Hide rows where cell is empty
                row.setVisible(value !== '');
            }
        });
    }    
    clearFilter() {
        // Filter Off: Show all rows
        this.sheet.datarow.forEach(row => {
            row.setVisible(true);
        });
    }    

    startColResize(event, colIndex) {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = this.sheet.datacol[colIndex].width;
    
        const onMouseMove = (moveEvent) => {
            const newWidth = startWidth + (moveEvent.clientX - startX);
            this.sheet.setColWidth(index2ColumnName(colIndex), newWidth);
        };
    
        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    select(isSelected) {
        this.selected = isSelected;
        this.sheet.datarow.forEach(row => row.datacell.forEach(cell => cell.select(isSelected)));
    }

    setWidth(px) {
        this.width=px;
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            cell.TD.style.minWidth = `${px}px`;
            cell.TD.style.maxWidth = `${px}px`;
            cell.TD.style.width = `${px}px`;
        });
        
    }
    setCellType(celltype) {
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            cell.setCellType(celltype);
        });
    }
    setClass(classname) {
        this.sheet.datarow.forEach(row => row.datacell.forEach(cell => cell.setClass(classname)));
    }

    removeClass(classname) {
        this.sheet.datarow.forEach(row => row.datacell.forEach(cell => cell.removeClass(classname)));
    }
}

const _CellTypes = {
    NONE:0,
    TEXT: 10,
    COMBOBOX: 20,
    IMAGELINK: 30
};

class TCELL {
    constructor(DOMDIV, sheet, row, colindex) {
        this.DOMDIV = DOMDIV;
        this.sheet = sheet;
        this.row = row;
        this.colindex = colindex;
        this.TD = null;
        this.selected = false;
        this.edit = false;
        this.valuetype = null;
        this.role = []; // csak ezek írhatják, de ha üres: mindenki 
        this.history = []; // Cella története
        this.AISummary = ""; // Összegzés a cella története alapján        
        this.create(sheet, row, colindex);
        this.celltype=_CellTypes.NONE;
        this.comboTemplateName=null;
        
        this.readonly=false;
        this.readOnly(false);

        this.info="" //info text, example if you implement a history 
        this.indicator = null; // Tároljuk a háromszög DOM elemét
        this.showInfo(false);
        this.styleIndex = null; // Stílus index a StyleManager-ben
        this.oldvalue = "";
    } 

    /**
     * Stílus beállítása a cella számára.
     * @param {string} styleString - A HTML stílus szövegként.
     */
    setStyle(styleString) {
        // Megkeressük vagy hozzáadjuk a stílust a StyleManager-ben
        this.styleIndex = this.sheet.parent.styleManager.addStyle(styleString);

        // Alkalmazzuk a stílust a cellára
        this.TD.style = styleString;
    }
    applyStyleByIndex(styleIndex) {
        this.styleIndex = styleIndex;
        const styleString = this.sheet.parent.styleManager.getStyleByIndex(styleIndex);
        if (styleString) {
            this.TD.style = styleString;
        }
    };    

    /**
     * Lekérjük a cellához tartozó stílust a StyleManager-ből.
     * @returns {string} - A cella stílusa szövegként.
     */
    getStyle() {
        if (this.styleIndex !== null) {
            return this.sheet.parent.styleManager.getStyleByIndex(this.styleIndex);
        }
        return '';
    }    

    showInfo(yes=true){
        if (yes)
            this.showinfo=true
        else
            this.showinfo=false;
    }

    readOnly(yes=true){
        this.readonly=yes;
        if (yes){
            this.setClass('ps_readonly');
        } else {
            this.removeClass('ps_readonly');
        }
    }

    name(colindex=null){
        if (colindex==null)
            return index2ColumnName(this.colindex)
        return index2ColumnName(colindex)
    }

    create(sheet, row, colindex) {
        this.TD = document.createElement('td');
        this.TD.id = `${sheet.name}${sheet.parent.data.indexOf(sheet.name)}${this.name(colindex)}${row.name}`;
        this.TD.className=cellclass
        this.TD.style.position = 'relative'; 
        row.DOMTR.appendChild(this.TD);
        this.TD.addEventListener('click', () => {
            if (sheet.parent.selected) {
                sheet.parent.selected.setClass(cellclass);
                sheet.parent.selected.removeClass(cellselect);
                //sheet.parent.selected.TD.className = cellclass; // Reset previous selected cell
            }
            this.setClass(cellselect); // Set the clicked cell's class to ps_selected
            sheet.parent.selected = this; // Update the selected cell in TPRELIMSHEET
            if (typeof sheet.parent.onCellFocus === 'function') {
                sheet.parent.onCellFocus(this); // Eseményhívás, amikor a cella kijelölésre kerül
            }
        });        
        this.TD.addEventListener('dblclick', () => {
            this.editCell();
        });     
        this.TD.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const options = [
                { label: 'Edit F2', action: (target) => target.editCell() },
                { label: 'Remove Formats', action: (target) => target.setStyle('') },
                { label: 'Color', action: (target) => applyColor(target, 'color') },
                { label: 'BackGroundColor', action: (target) => applyColor(target, 'background-color') },
                { label: 'Paste Color', action: (target) => target.applyColorToElement('color', this.sheet.parent.lastColor) },
                { label: 'Paste BgColor', action: (target) => target.applyColorToElement('background-color', this.sheet.parent.lastBackgroundColor) },                
                {
                    label: 'ALIGN',
                    submenu: [
                        { label: 'Wrap Text', action: (target) => applyTextAlignment(target, 'wrap') },
                        { label: 'Clip Text', action: (target) => applyTextAlignment(target, 'clip') },
                    ]
                },
                {
                    label: 'INPUT',
                    submenu: [
                        { label: 'NONE', action: (target) => target.setCellType(_CellTypes.NONE) },
                        { label: 'TEXT', action: (target) => target.setCellType(_CellTypes.TEXT) },
                        { label: 'IMAGE', action: (target) => target.setCellType(_CellTypes.IMAGELINK) },
                        { label: 'COMBOBOX', action: (target) => target.setCellType(_CellTypes.COMBOBOX) },
                    ]
                },
                { label:'INFO F3',action: (target) => target.showInfoModal() },
                { label:'HISTORY F4',action: (target) => target.showHistoryModal() }
            ];
            showContextMenu(event, this, options);
        });  
    }

    applyStyleToElement(styleString) {
        this.setStyle(styleString);
    }

    applyColorToElement(type, color) {
        _updateCellStyle(this, type, color);
    }

    addInfoIndicator() {
        this.removeClass(cellinfo);
        this.setClass(cellinfo);
        this.indicator=true;
    }

    removeInfoIndicator() {
        if (this.indicator) {
            this.removeClass(cellinfo);
            this.indicator = false;
        }
    }

    showInfo(show = true) {
        if (show) {
            if (this.info) { // Csak akkor adjuk hozzá az indikátort, ha van info
                this.addInfoIndicator();
            }
        } else {
            this.removeInfoIndicator();
        }
    }

    showInfoModal() {
        if (this.info=="") return;
        const modalBackground = document.createElement('div');
        modalBackground.className = 'modal-background';
        document.body.appendChild(modalBackground);

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = this.info;
        
        const closeModalButton = document.createElement('span');
        closeModalButton.className = 'modal-close';
        closeModalButton.textContent = 'X';
        modal.appendChild(closeModalButton);

        document.body.appendChild(modal);

        modalBackground.style.display = 'block';
        modal.style.display = 'block';

        closeModalButton.addEventListener('click', () => {
            modalBackground.remove();
            modal.remove();
        });

        modalBackground.addEventListener('click', () => {
            modalBackground.remove();
            modal.remove();
        });
    }    

    showHistoryModal() {
        if (this.history.length < 1) return;
    
        // Létrehozunk egy háttér divet és egy modális ablakot
        const modalBackground = document.createElement('div');
        modalBackground.className = 'modal-background';
    
        const modal = document.createElement('div');
        modal.className = 'modal';
    
        // A modális tartalom összeállítása fordított sorrendben
        const historyRows = this.history.slice().reverse().map(entry => `
            <tr>
                <td style="width:160px;">
                    <div>${entry.dt}</div>
                    <div>${entry.user}</div>
                </td>
                <td>
                    <textarea readonly>${entry.value}</textarea>
                </td>
            </tr>`).join('');
    
        const currentRow = `
            <tr>
                <td>
                    <div>Jelenlegi tartalom</div>
                    <div>${this.sheet.parent.username || 'Ismeretlen felhasználó'}</div>
                </td>
                <td>
                    <textarea readonly>${this.getValue()}</textarea>
                </td>
            </tr>`;
    
        // A modális ablak belső HTML-je
        modal.innerHTML = `
            <table class="history-table">
                ${currentRow}
                ${historyRows}
            </table>
            <span class="modal-close">X</span>
        `;
    
        // A modal és háttér hozzáadása a dokumentumhoz
        document.body.appendChild(modalBackground);
        document.body.appendChild(modal);
    
        // Megjelenítés és eseménykezelők hozzáadása
        modalBackground.style.display = 'block';
        modal.style.display = 'block';
    
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modalBackground.remove();
            modal.remove();
        });
    
        modalBackground.addEventListener('click', () => {
            modalBackground.remove();
            modal.remove();
        });
    }
    
    
    

    setRole(roles) {
        this.role = roles;
        this.updateRoleState();
    }

    canEdit() {
        if (this.role.length === 0) return true; // Ha nincs role megadva, bárki szerkeszthet
        const userRoles = this.sheet.parent.userroles;
        return this.role.some(role => userRoles.includes(role));
    }

    updateRoleState() {
        if (this.role.length > 0 && !this.canEdit()) {
            this.setClass('ps_rolereadonly');
        } else {
            this.removeClass('ps_rolereadonly');
        }
    }

    editCellOnEditStart(t,editcell){
        if (typeof t.sheet.parent.onEditStart === 'function') {
            t.sheet.parent.isEdit=true;
            t.sheet.parent.editCellOldValue=editcell.getValue();
            t.sheet.parent.onEditStart(t,t.sheet.parent.editCellOldValue); // Eseményhívás szerkesztés indításakor
        }        
    }

    editCell() {
        if (!this.canEdit() || this.readonly) { return }

        switch (this.celltype) {
            case  _CellTypes.TEXT: {
                const editor = new TEditTextarea(this);
                this.editCellOnEditStart(this,editor);
                break;
            }
            case  _CellTypes.COMBOBOX: {
                let editor=null;
                if (this.comboTemplateName==null){
                    const comboboxOptions = [
                        { key: "", value: "None" },
                        { key: "yes", value: "yes" },
                        { key: "no", value: "no" },
                    ];
                    editor = new TEditCombobox(this, comboboxOptions);
                } else {
                    editor = new TEditCombobox(this, this.comboTemplateName);
                }
                this.editCellOnEditStart(this,editor);        
                break;
            }
            case  _CellTypes.IMAGELINK: {
                const editor = new TEditImageLink(this);
                this.editCellOnEditStart(this,editor);        
                break;
            }
        }
    }

    moveToNextCell() {
        const currentRowIndex = this.row.name;
        const nextRowIndex = parseInt(currentRowIndex) ;
        const nextRow = this.sheet.datarow[nextRowIndex];

        if (nextRow) {
            const nextCell = nextRow.datacell[this.colindex];
            nextCell.TD.click(); // Move focus to the next cell
        }
    }

    getValue() {
        return this.oldvalue;
        //return this.TD.textContent;
    }

    setValue(value) {
        // Mentjük a régi értéket a történetbe
        const oldValue = this.getValue(); //this.sheet.parent.editCellOldValue;
        if (oldValue !== value) {
            this.sheet.parent.editCellOldValue=value;
        }
        if ( this.sheet.datacol[this.colindex].hasHistory==_HistoryTypes.ALL  && ( value  )
            || 
            (this.sheet.datacol[this.colindex].hasHistory==_HistoryTypes.CHANGED && oldValue !== value )
        ){            
            const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
            const user = this.sheet.parent.username;
            this.history.push({
                dt: timestamp,
                value: oldValue,
                user: user
            });        
            this.addHistoryClass();     
        }            
        
        this.oldvalue = value;
        this.TD.textContent = value;      
    }

    addHistoryClass() {
        if (this.history.length > 0) {
            this.setClass('ps_hashistory');
        } else {
            this.removeClass('ps_hashistory');
        }
    }

    updateAISummary() {
        // A history összegzése
        let summary = this.history.map(entry => {
            return `${entry.dt}: ${entry.user} írta: ${entry.value}`;
        }).join('\n');

        // Az aktuális tartalom hozzáadása
        const currentContent = this.getValue();
        summary += `\naktuális tartalom: ${currentContent}`;

        // Beállítjuk az AISummary-t
        this.AISummary = this.AIFunction(summary);
    }

    // dummy függvény, ami jelenleg csak kiírja a summary-t a konzolra, de majdan egy összegzést ad..
    AIFunction(summary) {
        console.log("AISummary processed:", summary);
        // Itt lehetne majd hívni egy AI feldolgozó API-t, stb.
        return summary; // egyelőr nem hív sy emmit

    }

    setClass(classname) {
        this.TD.classList.add(classname);
    }
    setCellType(celltype) {
        this.celltype = celltype;
    }

    removeClass(classname) {
        this.TD.classList.remove(classname);
    }

    select(isSelected) {
        this.selected = isSelected;
        if (isSelected) {
            this.setClass(cellselect);
        } else {
            this.removeClass(cellselect);
        }
    }
}

TCELL.prototype.clearCellHistory = function() {
    this.history = []; // Történet törlése
    this.removeClass('ps_hashistory'); // ps_hashistory osztály eltávolítása
};

TCELL.prototype.consolidateCellHistory = function() {
    if (this.history.length === 0) return;

    // Egyedi értékek összegyűjtése (distinct)
    const distinctValues = [...new Set(this.history.map(entry => entry.value))];

    // Jelenlegi érték hozzáadása, ha még nincs benne
    const currentValue = this.getValue();
    if (!distinctValues.includes(currentValue)) {
        distinctValues.push(currentValue);
    }

    // Az egyesített tartalom beállítása a cella aktuális értékeként
    this.setValue(distinctValues.join("\n"));

    // History törlése
    this.history = [];

    // ps_hashistory osztály eltávolítása
    this.removeClass('ps_hashistory');
};


class TEditCell {
    constructor(parentCell) {
        this.parentCell = parentCell;
        this.exit = null;
    }

    attach() {
        throw new Error("attach() must be implemented by the subclass");
    }

    getValue() {
        throw new Error("getValue() must be implemented by the subclass");
    }

    setValue(value) {
        throw new Error("setValue() must be implemented by the subclass");
    }

    attachKeyListener() {
        this.DOMElement.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                //this.parentCell.setValue(this.getValue());
                this.detach(); // Remove the editor element
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.exit=event.key;
                this.detach(); // Remove the editor element without saving
            }
        });
        this.DOMElement.addEventListener('blur', () => {
            if ( this.exit==null )
                this.parentCell.setValue(this.getValue());
            this.detach()
        });

    }

    detach() {
        if (typeof this.parentCell.sheet.parent.onEditEnd === 'function') {
            this.parentCell.sheet.parent.isEdit=false;
            this.parentCell.sheet.parent.onEditEnd(this.parentCell,this.parentCell.sheet.parent.editCellOldValue,this.getValue()); // Eseményhívás szerkesztés befejezésekor
        }
    
        try {
            this.DOMElement.remove();
        } catch (e) {
            // handle error if necessary
        }
    }
}

class TEditTextarea extends TEditCell {
    constructor(parentCell) {
        super(parentCell);     
        this.attach()   
    }

    attach() {
        const parentDOM=this.parentCell.TD
        this.DOMElement = document.createElement('textarea');
        this.DOMElement.value = this.parentCell.getValue();
        this.DOMElement.className = parentDOM.className;
        this.DOMElement.style = parentDOM.style;
        this.DOMElement.style.all = "unset";
        this.DOMElement.style.width = parentDOM.style.width;
        this.DOMElement.style.height = parentDOM.style.height;
        this.DOMElement.style.resize = 'none';
        parentDOM.innerHTML=''
        parentDOM.appendChild(this.DOMElement);
        this.DOMElement.focus();
        this.attachKeyListener();
    }

    getValue() {
        return this.DOMElement.value;
    }

    setValue(value) {
        this.DOMElement.value = value;
    }
}

class TEditCombobox extends TEditCell {
    constructor(parentCell, optionsOrTemplateName) {
        super(parentCell);
        this.spreadsheet = this.parentCell.sheet.parent;

        if (typeof optionsOrTemplateName === 'string') {
            // Ha string, akkor template névként kezeljük
            this.templateName = optionsOrTemplateName;

            // Ellenőrizzük, hogy létezik-e a template
            if (!this.spreadsheet.getComboTemplate(this.templateName)) {
                throw new Error(`Combobox template "${this.templateName}" not found`);
            }

        } else if (Array.isArray(optionsOrTemplateName)) {
            // Ha lista, akkor meg kell keresni vagy létrehozni a template-et
            const existingTemplateName = TEditCombobox.findMatchingTemplate(this.spreadsheet,optionsOrTemplateName);
            if (existingTemplateName) {
                this.templateName = existingTemplateName;
            } else {
                // Ha nincs ilyen template, akkor újat hozunk létre
                this.templateName = `template_${Object.keys(this.spreadsheet.combos).length + 1}`;
                this.spreadsheet.addComboTemplate(this.templateName, optionsOrTemplateName);
            }

        } else {
            throw new Error("Invalid parameter type for TEditCombobox. Expected string or array.");
        }

        this.attach();
    }

    // Statikus segédfüggvény, ami megkeresi, hogy van-e pontosan egyező template
    static findMatchingTemplate(spreadsheet, options) {
        for (const [templateName, templateOptions] of Object.entries(spreadsheet.combos)) {
            if (TEditCombobox.compareOptions(templateOptions, options)) {
                return templateName;
            }
        }
        return null;
    }

    // Statikus segédfüggvény, ami összehasonlítja két opciós listát
    static compareOptions(options1, options2) {
        if (options1.length !== options2.length) return false;
        for (let i = 0; i < options1.length; i++) {
            if (options1[i].key !== options2[i].key || options1[i].value !== options2[i].value) {
                return false;
            }
        }
        return true;
    }

    attach() {
        const parentDOM = this.parentCell.TD;

        // Lekérjük a combo template-et a név alapján
        const options = this.spreadsheet.getComboTemplate(this.templateName);
        if (!options) {
            throw new Error(`Combobox template "${this.templateName}" not found`);
        }        

        this.DOMElement = document.createElement('select');
        this.DOMElement.className = 'ps_selectedcell';
        this.DOMElement.style.width = '90%';
        this.DOMElement.style.height = parentDOM.style.height;
        this.DOMElement.style.margin = 0; // Megakadályozza, hogy a select eltérjen a cella pozíciójától
        this.DOMElement.style.boxSizing = "border-box"; // Megtartja a cella méretezési szabályait
        this.DOMElement.style.font = "inherit"; // Örökli a cella betűtípusát
        this.DOMElement.style.padding = "5px"; // A paddinget beállítjuk, hogy a szöveg ne érjen a széléhez
        this.DOMElement.style.outline = 'none';
        this.DOMElement.style.border = '1px solid #ccc';

        // Add options to the combobox (options as key-value pairs)
        options.forEach(option => {
            const optionElement = document.createElement('option');
            if (!option.key)
                optionElement.value = option.value;
            else
                optionElement.value = option.key;
            optionElement.textContent = option.value;
            this.DOMElement.appendChild(optionElement);
        });

        // Set the initial value to match the current cell value
        this.DOMElement.value = this.parentCell.getValue();

        parentDOM.innerHTML = '';
        parentDOM.appendChild(this.DOMElement);
        this.DOMElement.focus();
        this.attachKeyListener();
    }

    getValue() {
        // Return the selected option's key
        return this.DOMElement.value;
    }

    setValue(value) {
        this.DOMElement.value = value;
    }

  
}


class TEditImageLink extends TEditCell {
    constructor(parentCell) {
        super(parentCell);
        this.attach();
    }

    attach() {
        const parentDOM = this.parentCell.TD;
        const parentrow = this.parentCell.row.DOMTR;
        this.DOMElement = document.createElement('textarea');
        this.DOMElement.value = this.parentCell.getValue();
        this.DOMElement.className = parentDOM.className;
        this.DOMElement.style = parentDOM.style;
        this.DOMElement.style.all = "unset";
        this.DOMElement.style.width = parentDOM.style.width;
        this.DOMElement.style.height = parentrow.style.height;
        this.DOMElement.style.resize = 'none';
        parentDOM.innerHTML = '';
        parentDOM.appendChild(this.DOMElement);
        this.DOMElement.focus();
        this.attachKeyListener();
    }

    getValue() {
        return this.DOMElement.value;
    }

    setValue(value) {
        this.DOMElement.value = value;
    }

    detach() {
        const imageUrl = this.getValue();
        const parentDOM = this.parentCell.TD;
        parentDOM.innerHTML = '';

        if (imageUrl) {
            const imgElement = document.createElement('img');
            imgElement.src = imageUrl;
            imgElement.style.maxWidth = '100%';
            imgElement.style.maxHeight = this.parentCell.row.DOMTR.style.height;
            parentDOM.appendChild(imgElement);
        }

        this.DOMElement.remove();
    }
}



class StyleManager {
    constructor() {
        this.styles = []; // A stílustár, ahol az összes stílus kombinációt tároljuk
        this.addStyle("");
    }

    /**
     * Adott stílus hozzáadása a stílustárhoz, ha még nem szerepel benne.
     * @param {string} styleString - A HTML stílus szövegként.
     * @returns {number} - A stílus indexe a stílustárban.
     */
    addStyle(styleString) {
        const existingIndex = this.findStyleIndex(styleString);
        if (existingIndex !== -1) {
            return existingIndex; // Ha már létezik, visszaadjuk az indexét
        }

        // Ha nem létezik, hozzáadjuk a stílust a tárhoz, és visszaadjuk az új indexet
        const newIndex = this.styles.length;
        this.styles.push({ index: newIndex.toString(), style: styleString });
        return newIndex;
    }

    /**
     * Keres egy stílust a stílustárban.
     * @param {string} styleString - A HTML stílus szövegként.
     * @returns {number} - A stílus indexe, vagy -1 ha nem található.
     */
    findStyleIndex(styleString) {
        return this.styles.findIndex(styleObj => styleObj.style === styleString);
    }

    /**
     * Lekéri a stílust a stílustárból egy adott index alapján.
     * @param {number} index - A stílus indexe.
     * @returns {string} - A stílus szövegként.
     */
    getStyleByIndex(index) {
        const styleObj = this.styles[index];
        return styleObj ? styleObj.style : null;
    }
}


function _updateCellStyle(cell, type, color) {
    const currentStyle = cell.TD.style.cssText;

    // Parse the current styles into an object
    const styleObj = _parseStyleString(currentStyle);

    // Update the relevant style
    if (type === 'color') {
        styleObj.color = color;
    } else if (type === 'background-color') {
        styleObj['background-color'] = color;
    }

    // Convert the style object back to a string and set it
    const updatedStyle = _styleObjectToString(styleObj);
    cell.setStyle(updatedStyle);
}

function _parseStyleString(styleString) {
    const styleObj = {};
    styleString.split(';').forEach(style => {
        if (style) {
            const [key, value] = style.split(':').map(item => item.trim());
            styleObj[key] = value;
        }
    });
    return styleObj;
}

function _styleObjectToString(styleObj) {
    return Object.entries(styleObj).map(([key, value]) => `${key}: ${value}`).join('; ');
}


/*context*/ 

function createContextMenu(target, options) {
    const contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    //contextMenu.style.fontSize = '70%'; // Kisebb betűméret beállítása


    options.forEach(option => {
        const optionElement = document.createElement('div');        
        optionElement.textContent = option.label;

        if (option.submenu) {
            const submenu = document.createElement('div');
            submenu.className = 'context-submenu';

            option.submenu.forEach(subOption => {
                const subOptionElement = document.createElement('div');
                subOptionElement.className="context-menu_item";
                subOptionElement.textContent = subOption.label;
                subOptionElement.addEventListener('click', (event) => {
                    event.stopPropagation();
                    subOption.action(target);
                    contextMenu.remove(); // Kontextusmenü eltávolítása kattintás után
                });
                submenu.appendChild(subOptionElement);
            });

            optionElement.classList.add('has-submenu');
            optionElement.appendChild(submenu);
        } else {
            optionElement.className="context-menu_item";
            optionElement.addEventListener('click', (event) => {
                event.stopPropagation();
                option.action(target);
                contextMenu.remove(); // Kontextusmenü eltávolítása kattintás után
            });
        }

        contextMenu.appendChild(optionElement);
    });

    return contextMenu;
}


function showContextMenu(event, target, options) {
    event.preventDefault();

    // Ellenőrizzük, hogy nem a szélesség-állító elemre kattintottak (ha van ilyen)
    if (event.target.classList.contains('ps_col-resize-handle')) {
        return;
    }

    // Először távolítsuk el az összes meglévő kontextusmenüt a DOM-ból
    document.querySelectorAll('.context-menu').forEach(menu => {
        menu.remove();
    });
    document.getElementsByName('colorinput').forEach(menu => {
        menu.remove();
    });    

    // Új kontextusmenü létrehozása
    const contextMenu = createContextMenu(target, options);

    document.body.appendChild(contextMenu); // Hozzáadjuk a DOM-hoz
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.style.display = 'block';

    // A menü eltűnik, ha bárhová máshova kattintunk
    document.addEventListener('click', () => {
        contextMenu.remove();
        document.getElementsByName('colorinput').forEach(menu => {
            menu.remove();
        }); 
    }, { once: true });
}


/*show colorpicker */
function applyColor(target, type) {
    const colorInput = document.createElement('input');
    colorInput.name="colorinput";
    colorInput.type = 'color';
    
    // Alapértelmezett szín betöltése
    colorInput.value = (type === 'color') ? target.lastUsedColor : target.lastUsedBackgroundColor;

    colorInput.addEventListener('input', (event) => {
        const color = event.target.value;
        if (type === 'color') {
            target.applyColorToElement('color', color);
            target.lastUsedColor = color;
            target.sheet.parent.lastColor = color; // Globális utolsó szín frissítése
        } else {
            target.applyColorToElement('background-color', color);
            target.lastUsedBackgroundColor = color;
            target.sheet.parent.lastBackgroundColor = color; // Globális utolsó háttérszín frissítése
        }
    });

    colorInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            const color = event.target.value;
            if (type === 'color') {
                target.applyColorToElement('color', color);
                target.lastUsedColor = color;
                target.sheet.parent.lastColor = color;
            } else {
                target.applyColorToElement('background-color', color);
                target.lastUsedBackgroundColor = color;
                target.sheet.parent.lastBackgroundColor = color;
            }
            document.body.removeChild(colorInput);
        }
    });

    document.body.appendChild(colorInput);
    colorInput.click();

    colorInput.addEventListener('change', () => {
        try {document.body.removeChild(colorInput);} catch (error) {}
    });
}

function applyTextAlignment(target, alignmentType) {
    if (alignmentType === 'wrap') {
        const wrapStyle = `
            white-space: normal;
            overflow: visible;
            height: auto;
            max-height: none;
        `;
        target.applyStyleToElement(wrapStyle);
    } else if (alignmentType === 'clip') {
        const clipStyle = `
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        target.applyStyleToElement(clipStyle);
    }
}

