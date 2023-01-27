import { assert } from "console";
import { LayerIndex } from "./pioneer";
import dump from 'buffer-hexdump';
import * as buffer from "buffer";

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

export class MixerChannelData {
	channelSourceSelect: ChannelSource;
	channelAudioLevel: number;
	channelFaderLevel: number;
	channelTrimLevel: number;
	channelCompLevel: number;
	channelEqHiLevel: number;
	channelEqHiMidLevel: number;
	channelEqLowMidLevel: number;
	channelEqLowLevel: number;
	channelFilterColor: number;
	channelSend: number;
	channelCueA: boolean;
	channelCueB: boolean;
	channelCrossfaderAssign: CrossfaderAssign;

	static parse(buffer: Buffer, offset = 0): MixerChannelData {
		const channel = new MixerChannelData();

		channel.channelSourceSelect = buffer.readUInt8(offset);
		channel.channelAudioLevel = buffer.readUInt8(offset + 1);
		channel.channelFaderLevel = buffer.readUInt8(offset + 2);
		channel.channelTrimLevel = buffer.readUInt8(offset + 3);
		channel.channelCompLevel = buffer.readUInt8(offset + 4);
		channel.channelEqHiLevel = buffer.readUInt8(offset + 5);
		channel.channelEqHiMidLevel = buffer.readUInt8(offset + 6);
		channel.channelEqLowMidLevel = buffer.readUInt8(offset + 7);
		channel.channelEqLowLevel = buffer.readUInt8(offset + 8);
		channel.channelFilterColor = buffer.readUInt8(offset + 9);
		channel.channelSend = buffer.readUInt8(offset + 10);
		channel.channelCueA = buffer.readUInt8(offset + 11) === 1;
		channel.channelCueB = buffer.readUInt8(offset + 12) === 1;
		channel.channelCrossfaderAssign = buffer.readUInt8(offset + 13);

		return channel;
	}
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

	channelData: MixerChannelData[];

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

		// starting: 125-138 / 149-162 / 173-186 / 197-210 / 221-234

		this.channelData = new Array(6);
		for (let i = 0; i < 6; i++) {
			this.channelData[i] = MixerChannelData.parse(this.buffer, 125 + (i * 24));
		}
	}

	write(): void {
		throw new Error("not supported!");
	}

	length(): number {
		return 548;
	}

}

export class TCNetDataPacketBeatGridData extends TCNetDataPacket {
	layerID: LayerIndex;
	dataSize: number;
	totalPacket: number;
	packetNumber: number;
	dataClusterSize: number;
	beatNumber: number;

	length(): number {
		return 2442;
	}

	read() {
		// TODO:
		console.error('[note] You have hit a TCNet Data Packet - Beat Grid Data (spec. pg 17), this specification is ambiguous.');
		console.error('[note]   Please open an issue at https://github.com/UStAEnts/node-tcnet/issues/new and copy the following data verbatim');
		console.error(dump(this.buffer));
		throw new Error('not yet implemented - ambiguous data definition in the specification see notes on stderr');
	}
}

export class CueColor {
	red: number;
	green: number;
	blue: number;

	constructor(red: number, green: number, blue: number);
	constructor(buffer: Buffer);
	constructor(bufferOrRed: Buffer | number, green?: number, blue?: number) {
		if (typeof (bufferOrRed) === 'number') {
			if (typeof (green) === 'undefined' || typeof (blue) === 'undefined') {
				throw new Error('Invalid constructor - must provide r g b');
			}
			this.red = bufferOrRed;
			this.green = green;
			this.blue = blue;

		} else {
			this.red = bufferOrRed.readUInt8(0);
			this.green = bufferOrRed.readUInt8(1);
			this.blue = bufferOrRed.readUInt8(2);
		}

		assert(this.red >= 0 && this.red <= 255);
		assert(this.green >= 0 && this.green <= 255);
		assert(this.blue >= 0 && this.blue <= 255);
	}

	toHex(): string {
		return `#${ this.red.toString(16).substr(0, 2) }${ this.green.toString(16).substr(0, 2) }${ this.blue.toString(16).substr(0, 2) }`
	}
}

export class CueData {
	cueType: number;
	inTime: number;
	outTime: number;
	color: CueColor;

	static parse(buffer: Buffer, offset = 0): CueData {
		const data = new CueData();

		data.cueType = buffer.readUInt8(offset);
		data.inTime = buffer.readUInt32LE(offset + 2);
		data.outTime = buffer.readUInt32LE(offset + 6);
		data.color = new CueColor(buffer.slice(offset + 11));

		return data;
	}
}

export class TCNetDataPacketCueData extends TCNetDataPacket {
	layerID: LayerIndex;
	loopIn: number;
	loopOut: number;
	cues: CueData[];

	read(): void {
		this.layerID = this.buffer.readUInt8(25);
		this.loopIn = this.buffer.readUInt32LE(42);
		this.loopOut = this.buffer.readUInt32LE(46);

		this.cues = new Array(18);
		for (let i = 0; i < 18; i++) {
			this.cues[i] = CueData.parse(this.buffer, 47 + (i * 22));
		}
	}

	length(): number {
		return 436;
	}
}

// TODO: trying to use the same for both but this might not work
export class TCNetDataPacketWaveFormData extends TCNetDataPacket {
	layerID: LayerIndex;
	dataSize: number;
	totalPacket: number;
	packetNumber: number;
	waveformData: { level: number, color: number }[];

	read(): void {
		// TODO: this packet might be chunked in reality?
		this.layerID = this.buffer.readUInt8(25);
		this.dataSize = this.buffer.readUInt32LE(26);

		if (this.buffer.readUInt8(24) === 16) {
			assert(this.dataSize === 2400, `Expected data size to be 2400 but got ${ this.dataSize }`);
		}

		this.totalPacket = this.buffer.readUInt32LE(30);
		this.packetNumber = this.buffer.readUInt32LE(34);

		const waves = this.buffer.slice(42, 42 + this.dataSize);
		this.waveformData = [];
		for (let i = 0; i < waves.length / 2; i++) {
			this.waveformData.push({ color: waves.readUInt8(i * 2), level: waves.readUInt8((i + 1) * 2) })
		}
	}

	length(): number {
		return this.dataType === 16 ? 2442 : 4884;
	}
}


export enum StepStage {
	INITIALIZE = 0,
	RESPONSE = 1,
	UNKNOWN_2 = 2,
	UNKNOWN_3 = 3,
}

export class TCNetTimeSyncPacket extends TCNetPacket {
	step: StepStage;
	nodeListenerSupport: number;
	remoteTimestamp: number;

	length(): number {
		return 32;
	}

	read(): void {
		this.step = this.buffer.readUInt8(24);
		this.nodeListenerSupport = this.buffer.readUInt16LE(2);
		this.remoteTimestamp = this.buffer.readUInt32LE(28);
	}

	type(): number {
		return 10;
	}

	write(): void {
		throw  new Error("not supported!");
	}

}

export enum ErrorNotificationCode {
	REQUEST_UNKNOWN = 0,
	REQUEST_NOT_POSSIBLE = 13,
	REQUEST_DATA_EMPTY = 14,
	REQUEST_RESPONSE_OK = 255,
}

export class TCNetErrorNotification extends TCNetPacket {
	datatype: number;
	layerID: number;
	code: ErrorNotificationCode;
	messageType: number;

	length(): number {
		return 30;
	}

	read(): void {
		this.datatype = this.buffer.readUInt8(24);
		this.layerID = this.buffer.readUInt8(25);
		this.code = this.buffer.readUInt16LE(26);
		this.messageType = this.buffer.readUInt16LE(28);
	}

	type(): number {
		return 13;
	}

	write(): void {
		throw new Error('not supported!');
	}

}

export class TCNetControlPacket extends TCNetPacket {
	step: StepStage;
	dataSize: number;
	controlPath: string;

	length(): number {
		return 42 + (this.dataSize ?? 0);
	}

	read(): void {
		this.step = this.buffer.readUInt8(24);
		this.dataSize = this.buffer.readUInt32LE(26);
		this.controlPath = this.buffer.slice(42, 42 + this.dataSize).toString('ascii');
	}

	type(): number {
		return 101;
	}

	write(): void {
		throw new Error('not supported!');
	}

}

export class TCNetTextDataPacket extends TCNetControlPacket {
	type(): number {
		return 128;
	}
}

export class TCNetKeyboardDataPacket extends TCNetPacket {
	dataSize: number;
	keyboardData: Buffer;

	length(): number {
		return 44;
	}

	read(): void {
		this.dataSize = this.buffer.readUInt32LE(26);
		this.keyboardData = this.buffer.slice(42, 2);
		// TODO: this seems ambiguous in the spec - why have a data size if the keyboard data is fixed at 2 bytes?
	}

	type(): number {
		return TCNetMessageType.Keyboard;
	}

	write(): void {
		throw new Error('not supported!');
	}
}

export class TCNetDataFilePacket extends TCNetPacket {
	dataType: 128;
	layerID: LayerIndex;
	dataSize: number;
	totalPacket: number;
	packetNumber: number;
	dataClusterSize: number;
	fileData: Buffer;

	length(): number {
		return 42;
		// TODO: how are variable sized packets held
	}

	read(): void {
		this.dataType = 128;
		this.layerID = this.buffer.readUInt8(25);
		this.dataSize = this.buffer.readUInt32LE(26);
		this.totalPacket = this.buffer.readUInt32LE(30);
		this.packetNumber = this.buffer.readUInt32LE(34);
		this.dataClusterSize = this.buffer.readUInt32LE(38);
		this.fileData = this.buffer.slice(42, 42 + this.dataSize);
	}

	type(): number {
		return TCNetMessageType.File;
	}

	write(): void {
		throw new Error('not supported!');
	}
}

export class TCNetApplicationData extends TCNetPacket {
	dataIdentifier1: number;
	dataIdentifier2: number;
	dataSize: number;
	totalPackets: number;
	packetNumber: number;
	packetSignature: 178260640;
	data: Buffer;

	length(): number {
		return 42;
		// TODO: variable size
	}

	read(): void {
		this.dataIdentifier1 = this.buffer.readUInt8(24);
		this.dataIdentifier2 = this.buffer.readUInt8(25);
		this.dataSize = this.buffer.readUInt32LE(26);
		this.totalPackets = this.buffer.readUInt32LE(30);
		this.packetNumber = this.buffer.readUInt32LE(34);
		this.packetSignature = this.buffer.readUInt32LE(38) as any;
		this.data = this.buffer.slice(42, 42 + this.dataSize);
	}

	type(): number {
		return TCNetMessageType.ApplicationData;
	}

	write(): void {
		throw new Error('not supported!');
	}
}

export interface Constructable {
	new(...args: any[]): any;
}

export const TCNetPackets: Record<TCNetMessageType, Constructable | null> = {
	[TCNetMessageType.OptIn]: TCNetOptInPacket,
	[TCNetMessageType.OptOut]: TCNetOptOutPacket,
	[TCNetMessageType.Status]: TCNetStatusPacket,
	[TCNetMessageType.TimeSync]: TCNetTimeSyncPacket,
	[TCNetMessageType.Error]: TCNetErrorNotification,
	[TCNetMessageType.Request]: TCNetRequestPacket,
	[TCNetMessageType.ApplicationData]: TCNetApplicationData,
	[TCNetMessageType.Control]: TCNetControlPacket,
	[TCNetMessageType.Text]: TCNetTextDataPacket,
	[TCNetMessageType.Keyboard]: TCNetKeyboardDataPacket,
	[TCNetMessageType.Data]: TCNetDataPacket,
	[TCNetMessageType.File]: TCNetDataFilePacket,
	[TCNetMessageType.Time]: TCNetTimePacket,
};

export const TCNetDataPackets: Record<TCNetDataPacketType, typeof TCNetDataPacket | null> = {
	[TCNetDataPacketType.MetricsData]: TCNetDataPacketMetrics,
	[TCNetDataPacketType.MetaData]: TCNetDataPacketMetadata,
	[TCNetDataPacketType.BeatGridData]: TCNetDataPacketBeatGridData,
	[TCNetDataPacketType.CUEData]: TCNetDataPacketCueData,
	[TCNetDataPacketType.SmallWaveFormData]: TCNetDataPacketWaveFormData,
	[TCNetDataPacketType.BigWaveFormData]: TCNetDataPacketWaveFormData,
	[TCNetDataPacketType.MixerData]: TCNetDataPacketMixerData, // not yet implemented
};
