export class Logger {
    private static readonly _instance:Logger = new Logger();
    private readonly _output:string[];

    private _fileURI:string | null;
    private _fileTraceEnabled:boolean;
    private _statusFileURI:string | null;
    private _statusSeq:number;
    private _panelEnabled:boolean;
    private _panelTraceEnabled:boolean;
    private _debugEnabled:boolean;
    private _maxBufferLines:number;
    private _droppedLines:number;

    public constructor() {
        this._output = [];

        this._fileURI = null;
        this._fileTraceEnabled = true;
        this._statusFileURI = null;
        this._statusSeq = 0;
        this._panelEnabled = true;
        this._panelTraceEnabled = true;
        this._debugEnabled = false;
        this._maxBufferLines = 2000;
        this._droppedLines = 0;
    }

    //-----------------------------------

    public static setLogFile(fileURI:string | null, overwrite:boolean = false):void {
        Logger._instance._fileURI = fileURI;
        if (fileURI && overwrite) {
            try { FLfile.write(fileURI, ''); } catch (e) { /* ignore */ }
        }
    }

    public static setFileTraceEnabled(enabled:boolean):void {
        Logger._instance._fileTraceEnabled = enabled;
    }

    public static setStatusFile(fileURI:string | null, overwrite:boolean = false):void {
        Logger._instance._statusFileURI = fileURI;
        Logger._instance._statusSeq = 0;
        if (fileURI && overwrite) {
            try { FLfile.write(fileURI, ''); } catch (e) { /* ignore */ }
        }
    }

    public static setPanelEnabled(enabled:boolean):void {
        Logger._instance._panelEnabled = enabled;
    }

    public static setPanelTraceEnabled(enabled:boolean):void {
        Logger._instance._panelTraceEnabled = enabled;
    }

    public static setDebugEnabled(enabled:boolean):void {
        Logger._instance._debugEnabled = enabled;
    }

    public static setMaxBufferLines(maxLines:number):void {
        Logger._instance._maxBufferLines = maxLines;
    }

    public static isTraceEnabled():boolean {
        const inst = Logger._instance;
        const canWritePanel = inst._panelEnabled && inst._panelTraceEnabled;
        const canWriteFile = !!inst._fileURI && inst._fileTraceEnabled;
        return !!(canWritePanel || canWriteFile);
    }

    public static isDebugEnabled():boolean {
        const inst = Logger._instance;
        return !!(inst._debugEnabled && Logger.isTraceEnabled());
    }

    //-----------------------------------

    private static appendToFile(fileURI: string, content: string): void {
        // JSFL's FLfile.write append parameter differs across versions/docs.
        // Try the string mode first (matches our TS typings), then boolean fallback.
        try {
            const ok = (FLfile as any).write(fileURI, content, 'append');
            if (ok === false) {
                try { (FLfile as any).write(fileURI, content, true); } catch (e2) { /* ignore */ }
            }
            return;
        } catch (e) {
            try { (FLfile as any).write(fileURI, content, true); } catch (e2) { /* ignore */ }
        }
    }

    public static trace(...params:any[]):void {
        const inst = Logger._instance;
        // Fast-path: if trace output is disabled everywhere, avoid string building.
        const canWritePanel = inst._panelEnabled && inst._panelTraceEnabled;
        const canWriteFile = !!inst._fileURI && inst._fileTraceEnabled;
        if (!canWritePanel && !canWriteFile) return;

        inst.log('[TRACE] ' + params.join(' '), 'trace');
    }

    public static debug(...params:any[]):void {
        if (!Logger._instance._debugEnabled) return;
        Logger._instance.log('[DEBUG] ' + params.join(' '), 'trace');
    }

    public static status(...params:any[]):void {
        Logger._instance.status(params.join(' '));
    }

    public static warning(...params:any[]):void {
        Logger._instance.log('[WARNING] ' + params.join(' '), 'warning');
    }

    public static error(...params:any[]):void {
        Logger._instance.log('[ERROR] ' + params.join(' '), 'error');
    }

    public static assert(condition:boolean, message:string):void {
        if (!condition) {
            const errorMsg = '[ASSERT FAILED] ' + message;
            Logger._instance.log(errorMsg, 'error');
            Logger._instance.flush();
            throw new Error(errorMsg);
        }
    }

    public static flush():void {
        Logger._instance.flush();
    }

    //-----------------------------------

    private log(message:string, level:'trace' | 'warning' | 'error'):void {
        // Always write to file if configured.
        if (this._fileURI) {
            if (level !== 'trace' || this._fileTraceEnabled) {
                Logger.appendToFile(this._fileURI, message + '\n');
            }
        }

        // Panel output is optional and can be filtered.
        if (!this._panelEnabled) return;
        if (level === 'trace' && !this._panelTraceEnabled) return;

        if (this._maxBufferLines > 0 && this._output.length >= this._maxBufferLines) {
            this._droppedLines++;
            return;
        }

        this._output.push(message);
    }

    private status(message:string):void {
        if (!this._statusFileURI) return;
        this._statusSeq++;

        const line = `[STATUS ${this._statusSeq}] ${message}`;
        Logger.appendToFile(this._statusFileURI, line + '\n');
    }

    public flush():void {
        if (!this._panelEnabled) {
            this._output.length = 0;
            this._droppedLines = 0;
            return;
        }

        const output = this._output.slice(0);
        if (this._droppedLines > 0) {
            output.unshift(`[WARNING] Logger dropped ${this._droppedLines} lines (buffer limit ${this._maxBufferLines}).`);
        }

        fl.outputPanel.clear();
        fl.outputPanel.trace(output.join('\n'));
        this._output.length = 0;
        this._droppedLines = 0;
    }
}
