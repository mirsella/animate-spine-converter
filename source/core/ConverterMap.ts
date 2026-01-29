export class ConverterMap<KeyType, ValueType> {
    public readonly values:ValueType[];
    public readonly keys:KeyType[];

    public constructor() {
        this.values = [];
        this.keys = [];
    }

    public clear():void {
        this.values.length = 0;
        this.keys.length = 0;
    }

    public size():number {
        return this.keys.length;
    }

    public has(key:KeyType):boolean {
        return this.keys.indexOf(key) !== -1;
    }

    public set(key:KeyType, value:ValueType):void {
        const existingIndex = this.keys.indexOf(key);
        if (existingIndex !== -1) {
            this.values[existingIndex] = value;
        } else {
            this.values.push(value);
            this.keys.push(key);
        }
    }

    public get(key:KeyType):ValueType {
        for (let index = 0; index < this.keys.length; index++) {
            if (this.keys[index] === key) {
                return this.values[index];
            }
        }

        return null;
    }
}
