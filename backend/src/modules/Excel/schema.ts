import { Workbook } from "exceljs";

interface Column<T> {
    key: keyof T;
    header: string;
} 

export const createExcelTable = (workBook: Workbook) => 
    <T>(tableName: string, cols: Column<T>[], rows?: T[]) => {
    const table = workBook
        .addWorksheet(tableName)
        .addTable({
            name: tableName,
            columns: [],
            ref: '',
            rows: []
        
        });

    cols.forEach((col) => table)
}