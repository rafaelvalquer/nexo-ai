export class VisualStreamingGate{private started=false;start(){if(this.started)return false;this.started=true;return true;}reset(){this.started=false;}}
