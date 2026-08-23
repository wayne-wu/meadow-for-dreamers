void main()
{
    uint id = TDIndex();

    if (id >= TDNumElements())
        return;

	const uint FLOWER_INACTIVE = 0u;
	const uint FLOWER_GROWING  = 1u;
	const uint FLOWER_ALIVE    = 2u;
	const uint FLOWER_DYING    = 3u;
	
	uint flowerState = TDIn_FlowerState();
	float t = clamp(TDIn_LifeProgress(), 0.0, 1.0);
	float deathStartGrowth = TDIn_DeathStartGrowth();
	float maxHeight = TDIn_FlowerHeight();
	
	// Hold the flower's size at the point where dying began.
	float scaleProgress = flowerState == FLOWER_DYING
	    ? deathStartGrowth
	    : t;
	float growth = scaleProgress * scaleProgress *
	    (3.0 - 2.0 * scaleProgress);
	float widthScale = mix(0.08, 1.0, growth);
	float heightScale = mix(0.02, maxHeight, growth);
	
	float opacity = 1.0;
	
	if (flowerState == FLOWER_GROWING)
	{
	    // Fade in during the first 20% of growth.
	    opacity = smoothstep(0.0, uFadeInEnd, t);
	}
	else if (flowerState == FLOWER_DYING)
	{
	    float deathProgress = clamp(
	        1.0 - t / max(deathStartGrowth, 0.001),
	        0.0,
	        1.0
	    );
	
	    float fadeOut = smoothstep(
	        uFadeOutStart,
	        uFadeOutEnd,
	        deathProgress
	    );
	
	    opacity = 1.0 - fadeOut;
	}
	else if (flowerState == FLOWER_INACTIVE)
	{
	    opacity = 0.0;
	}
	
    FlowerScale[id] = vec3(
        widthScale,
        heightScale,
        1.0
    );

    vec4 color = TDIn_Color();
    color.a *= opacity;
    Color[id] = color;
}
