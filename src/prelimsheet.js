cellclass = "ps_cell"
cellselect = "ps_selected"
tableclass= "ps_table"

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

        document.addEventListener('keydown', (event) => {
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

    // Sheet megjelenítése index alapján
    showSheetByIndex(sheetindex) {
        // Ellenőrizzük, hogy az index érvényes-e
        if (sheetindex < 0 || sheetindex >= this.data.length) {
            throw new Error("Invalid sheet index");
        }

        // Az aktuális sheet DOM elemének elrejtése
        if (this.currentSheetIndex !== null) {
            this.data[this.currentSheetIndex].DOMDIV.style.display = 'none';
        }

        // Az új sheet DOM elemének megjelenítése
        this.currentSheetIndex = sheetindex;
        this.data[sheetindex].DOMDIV.style.display = 'block';
    }

    moveSelection(rowOffset, colOffset) {
        //const sheet = this.data[0]; // Assuming a single sheet for now
        const [col, row,sheetindex] = parseCellId(this.selected.TD.id); // Parse the selected cell's ID
        sheet = this.data[sheetindex-1]
        const newRow = row + rowOffset;
        const newCol = col + colOffset;

        if (newRow >= 0 && newRow < sheet.datarow.length && newCol >= 0 && newCol < sheet.datacol.length) {
            const newCell = sheet.datarow[newRow].datacell[newCol];
            this.selected.setClass(cellclass);
            this.selected.removeClass(cellselect);
            newCell.setClass(cellselect);
            this.selected = newCell;
        }
    }

    addSheets(num) {
        for (let i = 0; i < num; i++) {
            const sheet = new TSHEET(this);
            this.data.push(sheet);
        }
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

        return sheet;
    }    

    sheet(name){
        return this.data.find(sh => sh.name === name) || null;
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

TPRELIMSHEET.prototype.loadcsv = function(csvcontent, sheetindex = null) {
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
        // Egyébként a meglévő sheet kiválasztása
        sheet = this.data[sheetindex];
    }

    // Sheet méretének beállítása a CSV adatok alapján
    sheet.setSize(numRows, numCols);

    // Cellák kitöltése a CSV tartalmával
    rows.forEach((row, rowIndex) => {
        row.forEach((cellValue, colIndex) => {
            const cellName = toCellName([colIndex, rowIndex]);
            sheet.setCellValue(cellName, cellValue.trim());
        });
    });
};


class TSHEET {
    constructor(parent, name = '') {
        this.parent = parent;
        this.DOMDIV = null;
        this.name = name;
        this.datarow = [];
        this.datacol = [];
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
        for (let i = 0; i < num; i++) {
            const row = new TROW(this, i+1);
            this.datarow.push(row);
        }
    }

    addCols(num) {
        for (let i = 0; i < num; i++) {
            const col = new TCOL(this, i);
            this.datacol.push(col);
            this.datarow.forEach(row => {
                row.addCells(1);
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
        const [col, row,sheet] = parseCellId(cellId);
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

class TROW {
    constructor(sheet, name) {
        this.sheet = sheet;
        this.DOMTR = null;
        this.name = name; // pl "14"
        this.selected = false;
        this.datacell = [];
        this.height = 30;
        this.create(sheet.DOMDIV, sheet);
    }

    create(DOMDIV, sheet) {


        
        this.DOMTR = document.createElement('tr');
        DOMDIV.appendChild(this.DOMTR);
    
        // Create the row header cell (1, 2, 3, ...)
        const rowHeaderCell = document.createElement('th');
        rowHeaderCell.textContent = this.name; // Convert zero-based index to 1-based
    
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ps_row-resize-handle';
        rowHeaderCell.appendChild(resizeHandle);
    
        resizeHandle.addEventListener('mousedown', (event) => this.startRowResize(event));
    
        this.DOMTR.appendChild(rowHeaderCell);
    
        this.addCells(sheet.colnum);
        /*for (let i = 0; i < sheet.colnum; i++) {
            const cell = new TCELL(DOMDIV, sheet, this, i);
            this.datacell.push(cell);
        }*/
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
}


class TCOL {
    constructor(sheet,colindex) {
        this.sheet = sheet;
        this.colindex=colindex;
        this.name = index2ColumnName(this.colindex);
        this.selected = false;
        this.width=170;      
        this.createHeaders();  
    }

    createHeaders() {
        let i = this.colindex;
        // Create the header row (A, B, C, ...)
        const headerRow = document.createElement('tr');
        const emptyHeaderCell = document.createElement('th');
        headerRow.appendChild(emptyHeaderCell); // Empty top-left corner
    
        const th = document.createElement('th');
        th.textContent = index2ColumnName(i); // A, B, C, ...

        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'ps_col-resize-handle';
        th.appendChild(resizeHandle);

        resizeHandle.addEventListener('mousedown', (event) => this.startColResize(event, i));
        headerRow.appendChild(th);
        if (this.colindex==0)
            this.sheet.DOMDIV.insertBefore(headerRow,this.sheet.DOMDIV.childNodes[0])
        else {
            this.sheet.DOMDIV.childNodes[0].appendChild(th)
        }
        //this.sheet.DOMDIV.insert   appendChild(headerRow);
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
        this.sheet.datarow.forEach(row => {
            const cell = row.datacell[this.colindex];
            cell.TD.style.minWidth = `${px}px`;
            cell.TD.style.maxWidth = `${px}px`;
            cell.TD.style.width = `${px}px`;
        });
        this.width=px;
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
        this.create(sheet, row, colindex);
        this.celltype=_CellTypes.NONE;
        
        this.readonly=false;
        this.readOnly(false);

        this.info="" //info text, example if you implement a history 
        this.indicator = null; // Tároljuk a háromszög DOM elemét
        this.showInfo(false);
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
        });        
        this.TD.addEventListener('dblclick', () => {
            this.editCell();
        });       
    }

    addInfoIndicator() {
        if (!this.indicator) {
            this.indicator = document.createElement('div');
            this.indicator.className = 'triangle-indicator';
            this.TD.appendChild(this.indicator);

            this.indicator.addEventListener('click', (event) => {
                event.stopPropagation(); // Ne váltson ki más eseményeket, pl. cella kijelölését
                this.showInfoModal();
            });
        }
    }

    removeInfoIndicator() {
        if (this.indicator) {
            this.indicator.removeEventListener('click', this.showInfoModal); // Eltávolítjuk az eseménykezelőt
            this.TD.removeChild(this.indicator);
            this.indicator = null;
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


    editCell() {
        if (!this.canEdit() || this.readonly) { return }
        //const editor = new TEditTextarea(this);
        
        // const comboboxOptions = [
        //     { key: "", value: "Nincs érték" },
        //     { key: "igen", value: "Igen" },
        //     { key: "nem", value: "Nem" },
        // ];
        // const comboboxEditor = new TEditCombobox(this, comboboxOptions);
    
        //const editor = new TEditImageLink(this);

        switch (this.celltype) {
            case  _CellTypes.TEXT: {
                const editor = new TEditTextarea(this);
                break;
            }
            case  _CellTypes.COMBOBOX: {
                const comboboxOptions = [
                    { key: "", value: "Nincs érték" },
                    { key: "igen", value: "Igen" },
                    { key: "nem", value: "Nem" },
                ];
                const editor = new TEditCombobox(this, comboboxOptions);
                break;
            }
            case  _CellTypes.IMAGELINK: {
                const editor = new TEditImageLink(this);
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
        return this.TD.textContent;
    }

    setValue(value) {
        this.TD.textContent = value;
    }

    setClass(classname) {
        this.TD.classList.add(classname);
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

class TEditCell {
    constructor(parentCell) {
        this.parentCell = parentCell;
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
            if (event.key === 'Enter') {
                event.preventDefault();
                this.parentCell.setValue(this.getValue());
                this.detach(); // Remove the editor element
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.detach(); // Remove the editor element without saving
            }
        });
        this.DOMElement.addEventListener('blur', () => {
            this.parentCell.setValue(this.getValue());
            this.detach()
        });

    }

    detach() {
        this.DOMElement.remove();
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
    constructor(parentCell, options) {
        super(parentCell);
        this.options = options || [];     
        this.attach()   
    }

    attach() {
        const parentDOM = this.parentCell.TD;
        this.DOMElement = document.createElement('select');
        this.DOMElement.className = 'ps_selectedcell';
        //this.DOMElement.style = parentDOM.style;
        //this.DOMElement.style.all = "unset";
        this.DOMElement.style.width = '90%';
        this.DOMElement.style.height = parentDOM.style.height;
        this.DOMElement.style.margin = 0; // Megakadályozza, hogy a select eltérjen a cella pozíciójától
        this.DOMElement.style.boxSizing = "border-box"; // Megtartja a cella méretezési szabályait
        this.DOMElement.style.font = "inherit"; // Örökli a cella betűtípusát
        this.DOMElement.style.padding = "5px"; // A paddinget beállítjuk, hogy a szöveg ne érjen a széléhez
        this.DOMElement.style.outline = 'none';
        this.DOMElement.style.border = '1px solid #ccc';

        // Add options to the combobox (options as key-value pairs)
        this.options.forEach(option => {
            const optionElement = document.createElement('option');
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
