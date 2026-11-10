import {openDB} from 'idb';
export async function deleteCategory(id:string){const db=await openDB('schoolmanager-printlib',1);await db.delete('categories',id);db.close();}
