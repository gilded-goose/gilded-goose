// The paper world's shared SVG filters (Direction C's art.js), mounted once by the header so every page can use them:
//   gg-paper  cut paper: rough edge, torn white fringe, fibre grain, lifted shadow (scene layers, props)
//   gg-foil   gold foil: a crumpled height map lit diffusely with sharp speculars (the egg, coins). Never a gradient.
//   gg-grain  a light print grain on a drawn piece, keeping its own edges (the goose)
//   gg-ink    a tiny wobble so printed marks aren't vector-perfect
export function ArtDefs() {
  return (
    <svg width="0" height="0" className="art-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter id="gg-paper" x="-10%" y="-10%" width="125%" height="130%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={3} seed={7} result="edgeNoise" />
          <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale={3.2} xChannelSelector="R" yChannelSelector="G" result="cut" />
          <feTurbulence type="fractalNoise" baseFrequency="0.22" numOctaves={2} seed={3} result="fibre" />
          <feMorphology in="cut" operator="dilate" radius={1.6} result="fat" />
          <feDisplacementMap in="fat" in2="fibre" scale={4.5} xChannelSelector="R" yChannelSelector="B" result="torn" />
          <feFlood floodColor="#fffdf6" result="white" />
          <feComposite in="white" in2="torn" operator="in" result="fringe" />
          <feGaussianBlur in="torn" stdDeviation={2.2} result="blur" />
          <feOffset in="blur" dx={2.5} dy={4} result="off" />
          <feFlood floodColor="#02070d" floodOpacity={0.38} />
          <feComposite in2="off" operator="in" result="shadow" />
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={3} seed={11} result="grainRaw" />
          <feColorMatrix in="grainRaw" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 -0.9 0.62" result="grain" />
          <feComposite in="grain" in2="cut" operator="in" result="grainIn" />
          <feMerge result="paper"><feMergeNode in="cut" /><feMergeNode in="grainIn" /></feMerge>
          <feMerge><feMergeNode in="shadow" /><feMergeNode in="fringe" /><feMergeNode in="paper" /></feMerge>
        </filter>
        <filter id="gg-foil" x="-10%" y="-10%" width="125%" height="130%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={5} result="edgeNoise" />
          <feDisplacementMap in="SourceGraphic" in2="edgeNoise" scale={2.4} xChannelSelector="R" yChannelSelector="G" result="cut" />
          <feTurbulence type="turbulence" baseFrequency="0.045 0.06" numOctaves={4} seed={21} result="crumple" />
          <feDiffuseLighting in="crumple" surfaceScale={3.2} diffuseConstant={1.05} lightingColor="#e2b65a" result="diffuse">
            <feDistantLight azimuth={235} elevation={48} />
          </feDiffuseLighting>
          <feSpecularLighting in="crumple" surfaceScale={3.2} specularConstant={0.9} specularExponent={22} lightingColor="#fff4d2" result="spec">
            <feDistantLight azimuth={235} elevation={38} />
          </feSpecularLighting>
          <feComposite in="spec" in2="cut" operator="in" result="specIn" />
          <feComposite in="diffuse" in2="cut" operator="in" result="diffIn" />
          <feComposite in="specIn" in2="diffIn" operator="arithmetic" k1={0} k2={0.85} k3={1} k4={0} result="foil" />
          <feGaussianBlur in="cut" stdDeviation={1.4} result="b" />
          <feOffset in="b" dx={1.5} dy={2.5} result="o" />
          <feFlood floodColor="#02070d" floodOpacity={0.4} />
          <feComposite in2="o" operator="in" result="shadow" />
          <feMerge><feMergeNode in="shadow" /><feMergeNode in="foil" /></feMerge>
        </filter>
        <filter id="gg-grain" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={3} seed={11} result="raw" />
          <feColorMatrix in="raw" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.36  0 0 0 0 0.28  0 0 0 -0.7 0.42" result="grain" />
          <feComposite in="grain" in2="SourceGraphic" operator="in" result="grainIn" />
          <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="grainIn" /></feMerge>
        </filter>
        <filter id="gg-ink" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={2} result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale={1.4} xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}
