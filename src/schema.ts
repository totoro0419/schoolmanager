import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../public/printlib.schema.json';
import type {Metadata} from './types';
const ajv=new Ajv({allErrors:true});addFormats(ajv);
const validate=ajv.compile<Metadata>(schema);
export function validateMetadata(input:unknown):Metadata{if(!validate(input))throw Error('メタデータ形式が不正です: '+validate.errors?.slice(0,4).map(e=>`${e.instancePath} ${e.message}`).join(' / '));return structuredClone(input);}
