declare module 'imap' {
  export default class Imap {
    constructor(config: any);
    connect(): void;
    end(): void;
    openBox(name: string, readOnly: boolean, callback: (err: any, box?: any) => void): void;
    search(criteria: string[], callback: (err: any, uids: number[]) => void): void;
    fetch(uids: number[], options: any): any;
    getBoxes(callback: (err: any, boxes: any) => void): void;
    once(event: string, callback: (...args: any[]) => void): void;
    addFlags(uids: number[], flags: string, callback: (err: any) => void): void;
    delFlags(uids: number[], flags: string, callback: (err: any) => void): void;
  }
}
