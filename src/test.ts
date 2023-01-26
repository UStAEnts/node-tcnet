import {
    TCNetConfiguration,
    TCNetDataPacket,
    TCNetManagementHeader,
    PioneerDJTCClient,
    LayerIndex,
    TCNetRequestPacket,
    TCNetDataPacketType,
    TrackInfo,
} from "node-tcnet";
import dump from "buffer-hexdump";

// Init new TCNet configuration
const config = new TCNetConfiguration();

// Linux
config.broadcastInterface = "enx00e04c683637";

// Init new client for Pioneer DJ TCNet
const client = new PioneerDJTCClient(config);

// Wait for connect
client.connect().then(async () => {
    client.client().on("broadcast", (packet) => {
        // console.log(packet.constructor.name, packet.buffer.length)
    });
    client.client().on("unicast-packet", (packet) => {
        console.log(packet.constructor.name, packet.buffer.length);
        if (packet instanceof TCNetDataPacket) {
            console.log(`  instance of ${packet.dataType}`);

            if (packet.dataType === 150) {
                console.log(dump(packet.buffer));
            }
        }
    });

    const tryRequest = async (type: number, name: string) => {
        try {
            const data = await client.client().requestData(type, 2);
            console.log(`Resolved ${name}`);
            return data;
        } catch (e) {
            console.log(`Rejected ${name}: ${e.message}`);
            return null;
        }
    };

    const printLayer = (index: number, layer: PromiseSettledResult<TrackInfo>) => {
        if (layer.status === "fulfilled") {
            if (layer.value.trackTitle !== "") {
                console.log(`Layer ${index}: ${layer.value.trackTitle} by ${layer.value.trackArtist}`);
            } else {
                console.log(`Layer ${index}: No track loaded`);
            }
        } else {
            console.log(`Layer ${index}: Failed to fetch (${layer.reason})`);
        }
    };

    setInterval(async () => {
        const [l2, l3] = await Promise.allSettled([
            client.trackInfo(LayerIndex.Layer2),
            client.trackInfo(LayerIndex.Layer3),
        ]);

        printLayer(2, l2);
        printLayer(3, l3);
    }, 20000);

    const nop = (...args: any[]) => undefined;

    nop(await tryRequest(TCNetDataPacketType.MetricsData, "MetricsData"));
    nop(await tryRequest(TCNetDataPacketType.MetaData, "MetaData"));
    nop(await tryRequest(TCNetDataPacketType.BeatGridData, "BeatGridData"));
    nop(await tryRequest(TCNetDataPacketType.CUEData, "CUEData"));
    nop(await tryRequest(TCNetDataPacketType.SmallWaveFormData, "SmallWaveFormData"));
    nop(await tryRequest(TCNetDataPacketType.BigWaveFormData, "BigWaveFormData"));
    nop(await tryRequest(TCNetDataPacketType.MixerData, "MixerData"));

    console.log("Done");
});
