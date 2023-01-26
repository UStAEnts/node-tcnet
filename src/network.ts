import { assert } from "console";

export enum TCNetMessageType {
    OptIn = 2,
    OptOut = 3,
    Status = 5,
    TimeSync = 10,
    Error = 13,
    Request = 20,
    ApplicationData = 30,
    Control = 101,
    Text = 128,
    Keyboard = 132,
    Data = 200,
    File = 204,
    Time = 254,
}

export enum TCNetDataPacketType {
    MetricsData = 2,
    MetaData = 4,
    BeatGridData = 8,
    CUEData = 12,
    SmallWaveFormData = 16,
    BigWaveFormData = 32,
    MixerData = 150,
}

export enum NodeType {
    Auto = 1,
    Master = 2,
    Slave = 4,
    Repeater = 8,
}

interface TCNetReaderWriter {
    read(): void;
    write(): void;
}

export abstract class TCNetPacket implements TCNetReaderWriter {
    buffer: Buffer;
    header: TCNetManagementHeader;

    abstract read(): void;
    abstract write(): void;
    abstract length(): number;
    abstract type(): number;
}

export class TCNetManagementHeader implements TCNetReaderWriter {
    static MAJOR_VERSION = 3;
    static MAGIC_HEADER = "TCN";

    buffer: Buffer;

    nodeId: number;
    minorVersion: number;
    messageType: TCNetMessageType;
    nodeName: string;
    seq: number;
    nodeType: number;
    nodeOptions: number;
    timestamp: number;

    constructor(buffer: Buffer) {
        this.buffer = buffer;
    }

    public read(): void {
        this.nodeId = this.buffer.readUInt16LE(0);

        assert(this.buffer.readUInt8(2) == TCNetManagementHeader.MAJOR_VERSION);
        this.minorVersion = this.buffer.readUInt8(3);
        assert(this.buffer.slice(4, 7).toString("ascii") == TCNetManagementHeader.MAGIC_HEADER);

        this.messageType = this.buffer.readUInt8(7);
        this.nodeName = this.buffer.slice(8, 16).toString("ascii").replace(/\0.*$/g, "");
        this.seq = this.buffer.readUInt8(16);
        this.nodeType = this.buffer.readUInt8(17);
        this.nodeOptions = this.buffer.readUInt16LE(18);
        this.timestamp = this.buffer.readUInt32LE(20);
    }

    public write(): void {
        assert(Buffer.from(this.nodeName, "ascii").length <= 8);

        this.buffer.writeUInt16LE(this.nodeId, 0);
        this.buffer.writeUInt8(TCNetManagementHeader.MAJOR_VERSION, 2);
        this.buffer.writeUInt8(this.minorVersion, 3);
        this.buffer.write(TCNetManagementHeader.MAGIC_HEADER, 4, "ascii");
        this.buffer.writeUInt8(this.messageType, 7);
        this.buffer.write(this.nodeName.padEnd(8, "\x00"), 8, "ascii");
        this.buffer.writeUInt8(this.seq, 16);
        this.buffer.writeUInt8(this.nodeType, 17); // 02
        this.buffer.writeUInt16LE(this.nodeOptions, 18); // 07 00
        this.buffer.writeUInt32LE(this.timestamp, 20);
    }
}

export class TCNetOptInPacket extends TCNetPacket {
    nodeCount: number;
    nodeListenerPort: number;
    uptime: number;
    vendorName: string;
    appName: string;
    majorVersion: number;
    minorVersion: number;
    bugVersion: number;

    read(): void {
        this.nodeCount = this.buffer.readUInt16LE(24);
        this.nodeListenerPort = this.buffer.readUInt16LE(26);
        this.uptime = this.buffer.readUInt16LE(28);
        this.vendorName = this.buffer.slice(32, 48).toString("ascii").replace(/\0.*$/g, "");
        this.appName = this.buffer.slice(48, 64).toString("ascii").replace(/\0.*$/g, "");
        this.majorVersion = this.buffer.readUInt8(64);
        this.minorVersion = this.buffer.readUInt8(65);
        this.bugVersion = this.buffer.readUInt8(66);
    }
    write(): void {
        assert(Buffer.from(this.vendorName, "ascii").length <= 16);
        assert(Buffer.from(this.appName, "ascii").length <= 16);

        this.buffer.writeUInt16LE(this.nodeCount, 24);
        this.buffer.writeUInt16LE(this.nodeListenerPort, 26);
        this.buffer.writeUInt16LE(this.uptime, 28);
        this.buffer.write(this.vendorName.padEnd(16, "\x00"), 32, "ascii");
        this.buffer.write(this.appName.padEnd(16, "\x00"), 48, "ascii");
        this.buffer.writeUInt8(64, this.majorVersion);
        this.buffer.writeUInt8(65, this.minorVersion);
        this.buffer.writeUInt8(66, this.bugVersion);
    }

    length(): number {
        return 68;
    }

    type(): number {
        return TCNetMessageType.OptIn;
    }
}

export class TCNetOptOutPacket extends TCNetPacket {
    nodeCount: number;
    nodeListenerPort: number;

    read(): void {
        this.nodeCount = this.buffer.readUInt16LE(24);
        this.nodeListenerPort = this.buffer.readUInt16LE(26);
    }
    write(): void {
        this.buffer.writeUInt16LE(this.nodeCount, 24);
        this.buffer.writeUInt16LE(this.nodeListenerPort, 26);
    }

    length(): number {
        return 28;
    }

    type(): number {
        return TCNetMessageType.OptOut;
    }
}

export enum TCNetLayerStatus {
    IDLE = 0,
    PLAYING = 3,
    LOOPING = 4,
    PAUSED = 5,
    STOPPED = 6,
    CUEDOWN = 7,
    PLATTERDOWN = 8,
    FFWD = 9,
    FFRV = 10,
    HOLD = 11,
}

export class TCNetStatusPacket extends TCNetPacket {
    nodeCount: number;
    nodeListenerPort: number;
    layerSource: number[] = new Array(8);
    layerStatus: TCNetLayerStatus[] = new Array(8);
    trackID: number[] = new Array(8);
    smpteMode: number;
    autoMasterMode: number;
    layerName: string[] = new Array(8);

    read(): void {
        this.nodeCount = this.buffer.readUInt16LE(24);
        this.nodeListenerPort = this.buffer.readUInt16LE(26);

        for (let n = 0; n < 8; n++) {
            this.layerSource[n] = this.buffer.readUInt8(34 + n);
        }
        for (let n = 0; n < 8; n++) {
            this.layerStatus[n] = this.buffer.readUInt8(42 + n);
        }
        for (let n = 0; n < 8; n++) {
            this.trackID[n] = this.buffer.readUInt32LE(50 + n * 4);
        }
        this.smpteMode = this.buffer.readUInt8(83);
        this.autoMasterMode = this.buffer.readUInt8(84);

        for (let n = 0; n < 8; n++) {
            this.layerName[n] = this.buffer
                .slice(172 + n * 16, 172 + (n + 1) * 16)
                .toString("ascii")
                .replace(/\0.*$/g, "");
        }
    }
    write(): void {
        throw new Error("not supported!");
    }
    length(): number {
        return 300;
    }
    type(): number {
        return TCNetMessageType.Status;
    }
}

export class TCNetRequestPacket extends TCNetPacket {
    dataType: number;
    layer: number;

    read(): void {
        this.dataType = this.buffer.readUInt8(24);
        this.layer = this.buffer.readUInt8(25);
    }
    write(): void {
        assert(0 <= this.dataType && this.dataType <= 255);
        assert(0 <= this.layer && this.layer <= 255);

        this.buffer.writeUInt8(this.dataType, 24);
        this.buffer.writeUInt8(this.layer, 25);
    }
    length(): number {
        return 26;
    }
    type(): number {
        return TCNetMessageType.Request;
    }
}

export enum TCNetTimecodeState {
    Stopped = 0,
    Running = 1,
    ForceReSync = 2,
}

export class TCNetTimecode {
    mode: number;
    state: TCNetTimecodeState;
    hours: number;
    minutes: number;
    seconds: number;
    frames: number;

    read(buffer: Buffer, offset: number): void {
        this.mode = buffer.readUInt8(offset + 0);
        this.state = buffer.readUInt8(offset + 1);
        this.hours = buffer.readUInt8(offset + 2);
        this.minutes = buffer.readUInt8(offset + 3);
        this.seconds = buffer.readUInt8(offset + 4);
        this.frames = buffer.readUInt8(offset + 5);
    }
}

export class TCNetTimePacket extends TCNetPacket {
    layerCurrentTime: number[] = new Array(8);
    layerTotalTime: number[] = new Array(8);
    layerBeatmarker: number[] = new Array(8);
    layerState: TCNetLayerStatus[] = new Array(8);
    generalSMPTEMode: number;
    layerTimecode: TCNetTimecode[] = new Array(8);

    read(): void {
        for (let n = 0; n < 8; n++) {
            this.layerCurrentTime[n] = this.buffer.readUInt32LE(24 + n * 4);
            this.layerTotalTime[n] = this.buffer.readUInt32LE(56 + n * 4);
            this.layerBeatmarker[n] = this.buffer.readUInt8(88 + n);
            this.layerState[n] = this.buffer.readUInt8(96 + n);
            this.layerTimecode[n] = new TCNetTimecode();
            this.layerTimecode[n].read(this.buffer, 106 + n * 6);
        }
        this.generalSMPTEMode = this.buffer.readUInt8(105);
    }
    write(): void {
        throw new Error("not supported!");
    }
    length(): number {
        return 154;
    }
    type(): number {
        return TCNetMessageType.Time;
    }
}

export class TCNetDataPacket extends TCNetPacket {
    dataType: TCNetDataPacketType;
    layer: number;

    read(): void {
        this.dataType = this.buffer.readUInt8(24);
        this.layer = this.buffer.readUInt8(25);
    }
    write(): void {
        assert(0 <= this.dataType && this.dataType <= 255);
        assert(0 <= this.layer && this.layer <= 255);

        this.buffer.writeUInt8(this.dataType, 24);
        this.buffer.writeUInt8(this.layer, 25);
    }
    length(): number {
        return -1;
    }
    type(): number {
        return TCNetMessageType.Data;
    }
}

export enum TCNetLayerSyncMaster {
    Slave = 0,
    Master = 1,
}

export class TCNetDataPacketMetrics extends TCNetDataPacket {
    state: TCNetLayerStatus;
    syncMaster: TCNetLayerSyncMaster;
    beatMarker: number;
    trackLength: number;
    currentPosition: number;
    speed: number;
    beatNumber: number;
    bpm: number;
    pitchBend: number;
    trackID: number;

    read(): void {
        this.state = this.buffer.readUInt8(27);
        this.syncMaster = this.buffer.readUInt8(29);
        this.beatMarker = this.buffer.readUInt8(31);
        this.trackLength = this.buffer.readUInt32LE(32);
        this.currentPosition = this.buffer.readUInt32LE(36);
        this.speed = this.buffer.readUInt32LE(40);
        this.beatNumber = this.buffer.readUInt32LE(57);
        this.bpm = this.buffer.readUInt32LE(112);
        this.pitchBend = this.buffer.readUInt16LE(116);
        this.trackID = this.buffer.readUInt32LE(118);
    }

    write(): void {
        throw new Error("not supported!");
    }
    length(): number {
        return 122;
    }
}

export class TCNetDataPacketMetadata extends TCNetDataPacket {
    trackArtist: string;
    trackTitle: string;
    trackKey: number;
    trackID: number;

    read(): void {
        this.trackArtist = this.buffer.slice(29, 285).toString("utf16le").replace(/\0.*$/g, "");
        this.trackTitle = this.buffer.slice(285, 541).toString("utf16le").replace(/\0.*$/g, "");
        this.trackKey = this.buffer.readUInt16LE(541);
        this.trackID = this.buffer.readUInt32LE(543);
    }
    write(): void {
        throw new Error("not supported!");
    }
    length(): number {
        return 548;
    }
}

export enum MixerType {
    Standard = 0,
    Extended = 2,
}

export enum SendReturnSource {
    CH1 = 0,
    CH2 = 1,
    CH3 = 2,
    CH4 = 3,
    CH5 = 4,
    CH6 = 5,
    MIC = 6,
    MASTER = 7,
    CRF_A = 8,
    CRF_B = 9,
    NONE = 255,
}

export enum SendReturnType {
    USB_AUX = 0,
    USB_INSERT = 1,
    QUARTER_INCH_TS_JACK_AUX = 2,
    QUARTER_INCH_TS_JACK_INSERT = 3,
    NONE = 255,
}

export enum CrossfaderAssign {
    THRU = 0,
    A = 1,
    B = 2,
}

export enum ChannelSource {
    USBA = 0,
    USBB = 1,
    DIGITAL = 2,
    LINE = 3,
    PHONO = 4,
    INT = 5,
    RTN1 = 6,
    RTN2 = 7,
    RTN3 = 8,
    RTN_ALL = 9,
}

export class TCNetDataPacketMixerData extends TCNetDataPacket {
    mixerID: number; // 25 for 1
    mixerType: MixerType; // 26 for 1
    mixerName: string; // 29 for 16
    micEqHi: number; // 59 for 1
    micEqLow: number; // 60 for 1
    masterAudioLevel: number; // 61 for 1
    masterFaderLevel: number; // 62 for 1
    linkCueA: boolean;
    linkCueB: boolean;
    masterFilter: number;
    masterCueA: boolean;
    masterCueB: boolean;
    masterIsolatorOnOff: boolean;
    masterIsolatorHi: number;
    masterIsolatorMid: number;
    masterIsolatorLow: number;
    filterHpf: number;
    filterLpf: number;
    filterResonance: number;
    sendFxEffect: number;
    sendFxExt1: boolean;
    sendFxExt2: boolean;
    sendFxMasterMix: number;
    sendFxSizeFeedback: number;
    sendFxTime: number;
    sendFxHPF: number;
    sendFXLevel: number;
    sendReturn3SourceSelect: SendReturnSource;
    sendReturn3Type: SendReturnType;
    sendReturn3OnOff: boolean;
    sendReturn3Level: number;
    channelFaderCurve: number;
    crossFaderCurve: number;
    crossFader: number;
    beatFXOnOff: boolean;
    beatFXLevelDepth: number;
    beatFXChannelSelect: SendReturnSource;
    beatFXSelect: number;
    beatFXFreqHi: number;
    beatFXFreqMid: number;
    beatFXFreqLow: number;
    headphonesPreEQ: boolean;
    headphonesALevel: number;
    headphonesAMix: number;
    headphonesBLevel: number;
    headphonesBMix: number;
    boothLevel: number;
    boothEQHi: number;
    boothEQLow: number;

    channel1SourceSelect: ChannelSource;
    channel1AudioLevel: number;
    channel1FaderLevel: number;
    channel1TrimLevel: number;
    channel1CompLevel: number;
    channel1EqHiLevel: number;
    channel1EqHiMidLevel: number;
    channel1EqLowMidLevel: number;
    channel1EqLowLevel: number;
    channel1FilterColor: number;
    channel1Send: number;
    channel1CueA: boolean;
    channel1CueB: boolean;
    channel1CrossfaderAsign: CrossfaderAssign;

    channel2SourceSelect: ChannelSource;
    channel2AudioLevel: number;
    channel2FaderLevel: number;
    channel2TrimLevel: number;
    channel2CompLevel: number;
    channel2EqHiLevel: number;
    channel2EqHiMidLevel: number;
    channel2EqLowMidLevel: number;
    channel2EqLowLevel: number;
    channel2FilterColor: number;
    channel2Send: number;
    channel2CueA: boolean;
    channel2CueB: boolean;
    channel2CrossfaderAsign: CrossfaderAssign;

    channel3SourceSelect: ChannelSource;
    channel3AudioLevel: number;
    channel3FaderLevel: number;
    channel3TrimLevel: number;
    channel3CompLevel: number;
    channel3EqHiLevel: number;
    channel3EqHiMidLevel: number;
    channel3EqLowMidLevel: number;
    channel3EqLowLevel: number;
    channel3FilterColor: number;
    channel3Send: number;
    channel3CueA: boolean;
    channel3CueB: boolean;
    channel3CrossfaderAsign: CrossfaderAssign;

    channel4SourceSelect: ChannelSource;
    channel4AudioLevel: number;
    channel4FaderLevel: number;
    channel4TrimLevel: number;
    channel4CompLevel: number;
    channel4EqHiLevel: number;
    channel4EqHiMidLevel: number;
    channel4EqLowMidLevel: number;
    channel4EqLowLevel: number;
    channel4FilterColor: number;
    channel4Send: number;
    channel4CueA: boolean;
    channel4CueB: boolean;
    channel4CrossfaderAsign: CrossfaderAssign;

    channel5SourceSelect: ChannelSource;
    channel5AudioLevel: number;
    channel5FaderLevel: number;
    channel5TrimLevel: number;
    channel5CompLevel: number;
    channel5EqHiLevel: number;
    channel5EqHiMidLevel: number;
    channel5EqLowMidLevel: number;
    channel5EqLowLevel: number;
    channel5FilterColor: number;
    channel5Send: number;
    channel5CueA: boolean;
    channel5CueB: boolean;
    channel5CrossfaderAsign: CrossfaderAssign;

    channel6SourceSelect: ChannelSource;
    channel6AudioLevel: number;
    channel6FaderLevel: number;
    channel6TrimLevel: number;
    channel6CompLevel: number;
    channel6EqHiLevel: number;
    channel6EqHiMidLevel: number;
    channel6EqLowMidLevel: number;
    channel6EqLowLevel: number;
    channel6FilterColor: number;
    channel6Send: number;
    channel6CueA: boolean;
    channel6CueB: boolean;
    channel6CrossfaderAsign: CrossfaderAssign;

    read(): void {
        this.mixerID = this.buffer.readUInt8(25);
        this.mixerType = this.buffer.readUInt8(26);
        
        this.mixerName = this.buffer.slice(29, 29 + 16).toString("ascii");

        this.micEqHi = this.buffer.readUInt8(59);
        this.micEqLow = this.buffer.readUInt8(60);
        this.masterAudioLevel = this.buffer.readUInt8(61);
        this.masterFaderLevel = this.buffer.readUInt8(62);
        
        this.linkCueA = this.buffer.readUInt8(67) === 1;
        this.linkCueB = this.buffer.readUInt8(68) === 1;
        this.masterFilter = this.buffer.readUInt8(69);
        
        this.masterCueA = this.buffer.readUInt8(71) === 1;
        this.masterCueB = this.buffer.readUInt8(72) === 1;
        
        this.masterIsolatorOnOff = this.buffer.readUInt8(74) === 1;
        this.masterIsolatorHi = this.buffer.readUInt8(75);
        this.masterIsolatorMid = this.buffer.readUInt8(76);
        this.masterIsolatorLow = this.buffer.readUInt8(77);
        
        this.filterHpf = this.buffer.readUInt8(79);
        this.filterLpf = this.buffer.readUInt8(80);
        this.filterResonance = this.buffer.readUInt8(81);
        
        this.sendFxEffect = this.buffer.readUInt8(84);
        this.sendFxExt1 = this.buffer.readUInt8(85) === 1;
        this.sendFxExt2 = this.buffer.readUInt8(86) === 1;
        this.sendFxMasterMix = this.buffer.readUInt8(87);
        this.sendFxSizeFeedback = this.buffer.readUInt8(88);
        this.sendFxTime = this.buffer.readUInt8(89);
        this.sendFxHPF = this.buffer.readUInt8(90);
        this.sendFXLevel = this.buffer.readUInt8(91);
        this.sendReturn3SourceSelect = this.buffer.readUInt8(92);
        this.sendReturn3Type = this.buffer.readUInt8(93);
        this.sendReturn3OnOff = this.buffer.readUInt8(94) === 1;
        this.sendReturn3Level = this.buffer.readUInt8(95);
        
        this.channelFaderCurve = this.buffer.readUInt8(97);
        this.crossFaderCurve = this.buffer.readUInt8(98);
        this.crossFader = this.buffer.readUInt8(99);
        this.beatFXOnOff = this.buffer.readUInt8(100) === 1;
        this.beatFXLevelDepth = this.buffer.readUInt8(101);
        this.beatFXChannelSelect = this.buffer.readUInt8(102);
        this.beatFXSelect = this.buffer.readUInt8(103);
        this.beatFXFreqHi = this.buffer.readUInt8(104);
        this.beatFXFreqMid = this.buffer.readUInt8(105);
        this.beatFXFreqLow = this.buffer.readUInt8(106);
        this.headphonesPreEQ = this.buffer.readUInt8(107) === 1;
        this.headphonesALevel = this.buffer.readUInt8(108);
        this.headphonesAMix = this.buffer.readUInt8(109);
        this.headphonesBLevel = this.buffer.readUInt8(110);
        this.headphonesBMix = this.buffer.readUInt8(111);
        this.boothLevel = this.buffer.readUInt8(112);
        this.boothEQHi = this.buffer.readUInt8(113);
        this.boothEQLow = this.buffer.readUInt8(114);

        this.channel1SourceSelect = this.buffer.readUInt8(125);
        this.channel1AudioLevel = this.buffer.readUInt8(126);
        this.channel1FaderLevel = this.buffer.readUInt8(127);
        this.channel1TrimLevel = this.buffer.readUInt8(128);
        this.channel1CompLevel = this.buffer.readUInt8(129);
        this.channel1EqHiLevel = this.buffer.readUInt8(130);
        this.channel1EqHiMidLevel = this.buffer.readUInt8(131);
        this.channel1EqLowMidLevel = this.buffer.readUInt8(132);
        this.channel1EqLowLevel = this.buffer.readUInt8(133);
        this.channel1FilterColor = this.buffer.readUInt8(134);
        this.channel1Send = this.buffer.readUInt8(135);
        this.channel1CueA = this.buffer.readUInt8(136) === 1;
        this.channel1CueB = this.buffer.readUInt8(137) === 1;
        this.channel1CrossfaderAsign = this.buffer.readUInt8(138);

        this.channel2SourceSelect = this.buffer.readUInt8(149);
        this.channel2AudioLevel = this.buffer.readUInt8(150);
        this.channel2FaderLevel = this.buffer.readUInt8(151);
        this.channel2TrimLevel = this.buffer.readUInt8(152);
        this.channel2CompLevel = this.buffer.readUInt8(153);
        this.channel2EqHiLevel = this.buffer.readUInt8(154);
        this.channel2EqHiMidLevel = this.buffer.readUInt8(155);
        this.channel2EqLowMidLevel = this.buffer.readUInt8(156);
        this.channel2EqLowLevel = this.buffer.readUInt8(157);
        this.channel2FilterColor = this.buffer.readUInt8(158);
        this.channel2Send = this.buffer.readUInt8(159);
        this.channel2CueA = this.buffer.readUInt8(160) === 1;
        this.channel2CueB = this.buffer.readUInt8(161) === 1;
        this.channel2CrossfaderAsign = this.buffer.readUInt8(162);

        this.channel3SourceSelect = this.buffer.readUInt8(173);
        this.channel3AudioLevel = this.buffer.readUInt8(174);
        this.channel3FaderLevel = this.buffer.readUInt8(175);
        this.channel3TrimLevel = this.buffer.readUInt8(176);
        this.channel3CompLevel = this.buffer.readUInt8(177);
        this.channel3EqHiLevel = this.buffer.readUInt8(178);
        this.channel3EqHiMidLevel = this.buffer.readUInt8(179);
        this.channel3EqLowMidLevel = this.buffer.readUInt8(180);
        this.channel3EqLowLevel = this.buffer.readUInt8(181);
        this.channel3FilterColor = this.buffer.readUInt8(182);
        this.channel3Send = this.buffer.readUInt8(183);
        this.channel3CueA = this.buffer.readUInt8(184) === 1;
        this.channel3CueB = this.buffer.readUInt8(185) === 1;
        this.channel3CrossfaderAsign = this.buffer.readUInt8(186);

        this.channel4SourceSelect = this.buffer.readUInt8(197);
        this.channel4AudioLevel = this.buffer.readUInt8(198);
        this.channel4FaderLevel = this.buffer.readUInt8(199);
        this.channel4TrimLevel = this.buffer.readUInt8(200);
        this.channel4CompLevel = this.buffer.readUInt8(201);
        this.channel4EqHiLevel = this.buffer.readUInt8(202);
        this.channel4EqHiMidLevel = this.buffer.readUInt8(203);
        this.channel4EqLowMidLevel = this.buffer.readUInt8(204);
        this.channel4EqLowLevel = this.buffer.readUInt8(205);
        this.channel4FilterColor = this.buffer.readUInt8(206);
        this.channel4Send = this.buffer.readUInt8(207);
        this.channel4CueA = this.buffer.readUInt8(208) === 1;
        this.channel4CueB = this.buffer.readUInt8(209) === 1;
        this.channel4CrossfaderAsign = this.buffer.readUInt8(210);

        this.channel5SourceSelect = this.buffer.readUInt8(221);
        this.channel5AudioLevel = this.buffer.readUInt8(222);
        this.channel5FaderLevel = this.buffer.readUInt8(223);
        this.channel5TrimLevel = this.buffer.readUInt8(224);
        this.channel5CompLevel = this.buffer.readUInt8(225);
        this.channel5EqHiLevel = this.buffer.readUInt8(226);
        this.channel5EqHiMidLevel = this.buffer.readUInt8(227);
        this.channel5EqLowMidLevel = this.buffer.readUInt8(228);
        this.channel5EqLowLevel = this.buffer.readUInt8(229);
        this.channel5FilterColor = this.buffer.readUInt8(230);
        this.channel5Send = this.buffer.readUInt8(231);
        this.channel5CueA = this.buffer.readUInt8(232) === 1;
        this.channel5CueB = this.buffer.readUInt8(233) === 1;
        this.channel5CrossfaderAsign = this.buffer.readUInt8(234);

        this.channel6SourceSelect = this.buffer.readUInt8(245);
        this.channel6AudioLevel = this.buffer.readUInt8(246);
        this.channel6FaderLevel = this.buffer.readUInt8(247);
        this.channel6TrimLevel = this.buffer.readUInt8(248);
        this.channel6CompLevel = this.buffer.readUInt8(249);
        this.channel6EqHiLevel = this.buffer.readUInt8(250);
        this.channel6EqHiMidLevel = this.buffer.readUInt8(251);
        this.channel6EqLowMidLevel = this.buffer.readUInt8(252);
        this.channel6EqLowLevel = this.buffer.readUInt8(253);
        this.channel6FilterColor = this.buffer.readUInt8(254);
        this.channel6Send = this.buffer.readUInt8(255);
        this.channel6CueA = this.buffer.readUInt8(256) === 1;
        this.channel6CueB = this.buffer.readUInt8(257) === 1;
        this.channel6CrossfaderAsign = this.buffer.readUInt8(258);
    }
    write(): void {
        throw new Error("not supported!");
    }
    length(): number {
        return 548;
    }
}

export interface Constructable {
    new (...args: any[]): any;
}

export const TCNetPackets: Record<TCNetMessageType, Constructable | null> = {
    [TCNetMessageType.OptIn]: TCNetOptInPacket,
    [TCNetMessageType.OptOut]: TCNetOptOutPacket,
    [TCNetMessageType.Status]: TCNetStatusPacket,
    [TCNetMessageType.TimeSync]: null, // not yet implemented
    [TCNetMessageType.Error]: null, // not yet implemented
    [TCNetMessageType.Request]: TCNetRequestPacket,
    [TCNetMessageType.ApplicationData]: null, // not yet implemented
    [TCNetMessageType.Control]: null, // not yet implemented
    [TCNetMessageType.Text]: null, // not yet implemented
    [TCNetMessageType.Keyboard]: null, // not yet implemented
    [TCNetMessageType.Data]: TCNetDataPacket,
    [TCNetMessageType.File]: null, // not yet implemented
    [TCNetMessageType.Time]: TCNetTimePacket,
};

export const TCNetDataPackets: Record<TCNetDataPacketType, typeof TCNetDataPacket | null> = {
    [TCNetDataPacketType.MetricsData]: TCNetDataPacketMetrics,
    [TCNetDataPacketType.MetaData]: TCNetDataPacketMetadata,
    [TCNetDataPacketType.BeatGridData]: null, // not yet implemented
    [TCNetDataPacketType.CUEData]: null, // not yet implemented
    [TCNetDataPacketType.SmallWaveFormData]: null, // not yet implemented
    [TCNetDataPacketType.BigWaveFormData]: null, // not yet implemented
    [TCNetDataPacketType.MixerData]: TCNetDataPacketMixerData, // not yet implemented
};
