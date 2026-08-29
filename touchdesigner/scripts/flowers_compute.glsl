const uint FLOWER_INACTIVE = 0u;
const uint FLOWER_GROWING  = 1u;
const uint FLOWER_ALIVE    = 2u;
const uint FLOWER_DYING    = 3u;
const uint FLOWER_WAITING_TO_DIE = 4u;

uint hashUint(uint x)
{
    x ^= x >> 16;
    x *= 0x7feb352du;
    x ^= x >> 15;
    x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}

float random01(uint seed)
{
    return float(hashUint(seed)) * 2.3283064365386963e-10;
}

uint weightedFlowerId(
    uint patchId,
    uint flowerCount,
    uint recentCount,
    float recentProbability)
{
    recentCount = min(recentCount, flowerCount);
    uint olderCount = flowerCount - recentCount;
    recentProbability = clamp(recentProbability, 0.0, 1.0);

    float groupRoll = random01(patchId ^ 0x9e3779b9u);
    float indexRoll = random01(patchId ^ 0x85ebca6bu);

    // With no recent flowers, sample uniformly from the full older group.
    if (recentCount == 0u)
    {
        return min(
            uint(floor(indexRoll * float(flowerCount))),
            flowerCount - 1u
        );
    }

    // If every flower is recent, there is no older group to select from.
    if (olderCount == 0u)
    {
        return min(
            uint(floor(indexRoll * float(recentCount))),
            recentCount - 1u
        );
    }

    if (groupRoll < recentProbability)
    {
        uint recentOffset = min(
            uint(floor(indexRoll * float(recentCount))),
            recentCount - 1u
        );
        return olderCount + recentOffset;
    }

    return min(
        uint(floor(indexRoll * float(olderCount))),
        olderCount - 1u
    );
}

uint particleBurstCount(uint id, uint patchId, float simTime)
{
    uint seed =
        id * 73856093u ^
        patchId * 19349663u ^
        uint(simTime * 1000.0);

    return uint(floor(random01(seed) * uDeathBurstMax));
}

void main()
{
    uint id = TDIndex();

    if (id >= TDNumElements())
        return;

    uint patchId = TDIn_PatchId();
    uint flowerId = TDIn_FlowerId();

    // Whether this flower is allowed to spawn a new patch.
    int canSpawn = TDIn_Spawn();

    // Time at which this flower was spawned, in seconds.
    float spawnTime = TDIn_SpawnTime();

    // Time spent fully alive, in seconds.
    float age = TDIn_Age();

    // Total lifespan of this flower, in seconds.
    float lifeSpan = TDIn_LifeSpan();

    // Per-flower delay before the growing state begins animating.
    float growDelay = TDIn_GrowDelay();

    uint flowerState = TDIn_FlowerState();

    // Time spent in the current state, in seconds.
    float stateTime = TDIn_StateTime();

    // Growth progress of this flower, in the range [0, 1].
    float growth = TDIn_LifeProgress();

    // Number of particles emitted during the death phase.
    uint deathEmitted = TDIn_DeathEmitted();

    // Target number of particles to emit during the death phase.
    uint deathTarget = TDIn_DeathTarget();
    
    float deathStartGrowth = TDIn_DeathStartGrowth();

    float deathDelay = TDIn_DeathDelay();

    uint deathPulse = 0u;


    // Grab logic
    float grabThreshold = TDIn_GrabThreshold();


    stateTime += uDeltaTime;

    // Assign an inactive root to a newly spawned patch.
    bool shouldSpawn =
        uSpawnPatchId > 0 &&
        flowerState == FLOWER_INACTIVE &&
        canSpawn == 1 &&
        uGrab < 0.9;

    if (shouldSpawn)
    {
        patchId = uint(uSpawnPatchId);

        // Assign the texture once per spawn, splitting probability between
        // the recent and older texture-layer groups.
        uint flowerVariations = uint(max(uFlowerVariations, 1));
        flowerId = weightedFlowerId(
            patchId,
            flowerVariations,
            uRecentFlowerCount,
            uRecentFlowerProbability
        );

        flowerState = FLOWER_GROWING;
        stateTime = 0.0;
        growth = 0.0;
        age = 0.0;
        spawnTime = uSimTime;

        uint lifeSeed =
            id * 73856093u ^
            patchId * 19349663u;

        lifeSpan = mix(
            uLifeRange.x, 
            uLifeRange.y,
            random01(lifeSeed)
        );
    }

    // Age only measures time spent fully alive.
    if (flowerState == FLOWER_ALIVE)
    {
        age += uDeltaTime;
    }

    bool shouldKillPatch =
        uKillPatchId >= 0 &&
        flowerState != FLOWER_INACTIVE &&
        flowerState != FLOWER_DYING &&
        patchId == uint(uKillPatchId);

    bool shouldExpire =
        flowerState == FLOWER_ALIVE &&
        age >= lifeSpan;

    bool shouldGrab =
        uGrabPulse > grabThreshold &&
        (
            flowerState == FLOWER_ALIVE ||
            flowerState == FLOWER_GROWING
        );

    if (shouldGrab)
    {
        flowerState = FLOWER_WAITING_TO_DIE;
        stateTime = 0.0;

        uint delaySeed =
            id * 73856093u ^
            patchId * 19349663u ^
            uint(uSimTime * 1000.0);

        deathDelay = mix(
            uDeathDelayRange.x,
            uDeathDelayRange.y,
            random01(delaySeed)
        );
    }

    if (flowerState == FLOWER_WAITING_TO_DIE && stateTime >= deathDelay)
    {
        shouldKillPatch = true;
    }

    if (shouldKillPatch || shouldExpire)
    {
        flowerState = FLOWER_DYING;
        stateTime = 0.0;

        deathEmitted = 0u;
        deathTarget =
            particleBurstCount(id, patchId, uSimTime);

        deathStartGrowth = max(growth, 0.001);
    }

    if (flowerState == FLOWER_GROWING)
    {
        float delayedGrowTime = max(
            stateTime - growDelay,
            0.0
        );

        growth = clamp(
            delayedGrowTime / max(uGrowDuration, 0.001),
            0.0,
            1.0
        );

        if (growth >= 1.0)
        {
            flowerState = FLOWER_ALIVE;
            stateTime = 0.0;
            age = 0.0;
        }
    }

    else if (flowerState == FLOWER_DYING)
    {
        growth = max(
            growth - uDeltaTime / max(uDeathDuration, 0.001),
            0.0
        );

        float deathProgress = clamp(
            1.0 - growth / max(deathStartGrowth, 0.001),
            0.0,
            1.0
        );

        uint desiredEmitted = uint(
            floor(deathProgress * float(deathTarget))
        );

        if (desiredEmitted > deathEmitted)
            deathPulse = desiredEmitted - deathEmitted;

        deathEmitted = desiredEmitted;

        if (growth <= 0.0)
        {
            flowerState = FLOWER_INACTIVE;
            stateTime = 0.0;
            growth = 0.0;
        }
    }

    uint isActive =
        flowerState == FLOWER_INACTIVE ? 0u : 1u;

    Active[id] = isActive;
    PatchId[id] = patchId;
    FlowerId[id] = flowerId;
    SpawnTime[id] = spawnTime;
    Age[id] = age;
    LifeSpan[id] = lifeSpan;
    LifeProgress[id] = growth;
    DeathPulse[id] = deathPulse;

    FlowerState[id] = flowerState;
    StateTime[id] = stateTime;
    DeathEmitted[id] = deathEmitted;
    DeathTarget[id] = deathTarget;
    DeathStartGrowth[id] = deathStartGrowth;
    DeathDelay[id] = deathDelay;
}
