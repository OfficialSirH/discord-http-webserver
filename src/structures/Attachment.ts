import { Result } from '@sapphire/result';
import { resolveFile } from '../utilities.js';

export class Attachment {
  public readonly path?: string;
  public readonly name: string;
  public readonly url: `attachment://${string}`;
  private _data?: Buffer;

  public constructor(path: string, name?: string);
  public constructor(data: Buffer, name: string);

  public constructor(pathOrData: string | Buffer, name?: string) {
    if (typeof pathOrData === 'string') {
      this.path = pathOrData;
      this.name = name ?? pathOrData.split('/').pop()!;
    } else {
      this._data = pathOrData;
      this.name = name!;
    }
    this.url = `attachment://${this.name}`;
  }

  data() {
    return this._data ? Result.ok(this._data) : resolveFile(this?.path as string);
  }
}
