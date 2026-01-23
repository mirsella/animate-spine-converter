export class Logger {
    private static readonly _instance:Logger = new Logger();
    private readonly _output:string[];

    public constructor() {
        this._output = [];
    }

    //-----------------------------------

    public static trace(...params:any[]):void {
        Logger._instance.trace('[TRACE] ' + params.join(' '));
    }

    public static warning(...params:any[]):void {
        Logger._instance.trace('[WARNING] ' + params.join(' '));
    }

    public static error(...params:any[]):void {
        Logger._instance.trace('[ERROR] ' + params.join(' '));
    }

    public static assert(condition:boolean, message:string):void {
        if (!condition) {
            const errorMsg = '[ASSERT FAILED] ' + message;
            Logger._instance.trace(errorMsg);
            Logger._instance.flush();
            throw new Error(errorMsg);
        }
    }

    public static flush():void {
        Logger._instance.flush();
    }

    //-----------------------------------

    public trace(message:string):void {
        // Immediate flush for debugging crashes
        fl.outputPanel.trace(message);
        // this._output.push(message);
    }

    public flush():void {
        // fl.outputPanel.clear();
        // fl.outputPanel.trace(this._output.join('\n'));
        // this._output.length = 0;
    }
}
