# U.S. coverage baseline

Checked November 11, 2026. These are live provider checks from the audit host, not browser journeys or statewide certification.

For each sample, the audit resolves the named city/town to the expected state, requests a short driving route and walking route to a nearby synthetic endpoint (rejecting snaps over 2 km), and requires nonempty Google Places results for a local restaurant query. This does not verify restaurant accuracy, arbitrary addresses, rural roads outside the sample, cross-state travel, transit, cycling, live GPS, or indoor floor plans. A pass means only these four requests met their checks at the recorded time.

All 51 capital-city samples and all 50 smaller-town samples passed: 404 checks across 101 samples. D.C. has no separate smaller-town sample. No search response payloads or returned coordinates are retained.

The initial New Shoreham audit failure was a harness error: `types=place` excluded its `locality` classification. Including both place and locality resolved it; the app already used unrestricted suggestions.

| State | Capital sample | Smaller-town sample | Search / drive / walk / places | Indoor / transit |
|---|---|---|---|---|
| Alabama | Montgomery | Selma | Pass in sampled locations | Not audited |
| Alaska | Juneau | Bethel | Pass in sampled locations | Not audited |
| Arizona | Phoenix | Page | Pass in sampled locations | Not audited |
| Arkansas | Little Rock | Mountain View | Pass in sampled locations | Not audited |
| California | Sacramento | Bishop | Pass in sampled locations | Not audited |
| Colorado | Denver | Leadville | Pass in sampled locations | Not audited |
| Connecticut | Hartford | Kent | Pass in sampled locations | Not audited |
| Delaware | Dover | Georgetown | Pass in sampled locations | Not audited |
| Florida | Tallahassee | Apalachicola | Pass in sampled locations | Not audited |
| Georgia | Atlanta | Dahlonega | Pass in sampled locations | Not audited |
| Hawaii | Honolulu | Hana | Pass in sampled locations | Not audited |
| Idaho | Boise | McCall | Pass in sampled locations | Not audited |
| Illinois | Springfield | Galena | Pass in sampled locations | Not audited |
| Indiana | Indianapolis | Nashville | Pass in sampled locations | Not audited |
| Iowa | Des Moines | Decorah | Pass in sampled locations | Not audited |
| Kansas | Topeka | Colby | Pass in sampled locations | Not audited |
| Kentucky | Frankfort | Pikeville | Pass in sampled locations | Not audited |
| Louisiana | Baton Rouge | Natchitoches | Pass in sampled locations | Not audited |
| Maine | Augusta | Rangeley | Pass in sampled locations | Not audited |
| Maryland | Annapolis | Oakland | Pass in sampled locations | Not audited |
| Massachusetts | Boston | Great Barrington | Pass in sampled locations | Not audited |
| Michigan | Lansing | Munising | Pass in sampled locations | Not audited |
| Minnesota | Saint Paul | Ely | Pass in sampled locations | Not audited |
| Mississippi | Jackson | Natchez | Pass in sampled locations | Not audited |
| Missouri | Jefferson City | Hermann | Pass in sampled locations | Not audited |
| Montana | Helena | Glasgow | Pass in sampled locations | Not audited |
| Nebraska | Lincoln | Valentine | Pass in sampled locations | Not audited |
| Nevada | Carson City | Ely | Pass in sampled locations | Not audited |
| New Hampshire | Concord | Littleton | Pass in sampled locations | Not audited |
| New Jersey | Trenton | Newton | Pass in sampled locations | Not audited |
| New Mexico | Santa Fe | Taos | Pass in sampled locations | Not audited |
| New York | Albany | Saranac Lake | Pass in sampled locations | Not audited |
| North Carolina | Raleigh | Boone | Pass in sampled locations | Not audited |
| North Dakota | Bismarck | Devils Lake | Pass in sampled locations | Not audited |
| Ohio | Columbus | Marietta | Pass in sampled locations | Not audited |
| Oklahoma | Oklahoma City | Guymon | Pass in sampled locations | Not audited |
| Oregon | Salem | Burns | Pass in sampled locations | Not audited |
| Pennsylvania | Harrisburg | Wellsboro | Pass in sampled locations | Not audited |
| Rhode Island | Providence | New Shoreham | Pass in sampled locations | Not audited |
| South Carolina | Columbia | Beaufort | Pass in sampled locations | Not audited |
| South Dakota | Pierre | Custer | Pass in sampled locations | Not audited |
| Tennessee | Nashville | Paris | Pass in sampled locations | Not audited |
| Texas | Austin | Marfa | Pass in sampled locations | Not audited |
| Utah | Salt Lake City | Kanab | Pass in sampled locations | Not audited |
| Vermont | Montpelier | Stowe | Pass in sampled locations | Not audited |
| Virginia | Richmond | Abingdon | Pass in sampled locations | Not audited |
| Washington | Olympia | Forks | Pass in sampled locations | Not audited |
| West Virginia | Charleston | Elkins | Pass in sampled locations | Not audited |
| Wisconsin | Madison | Bayfield | Pass in sampled locations | Not audited |
| Wyoming | Cheyenne | Cody | Pass in sampled locations | Not audited |
| District of Columbia | Washington | Not applicable | Pass in sampled locations | Not audited |

## Reproduce

Use Node 22 and the existing `VITE_MAPBOX_TOKEN` environment variable or local `.env.local`. The script calls paid provider services and runs sequentially with request timeouts. It exits nonzero on gaps; it does not silently skip failures or retry them into passes.

```sh
npm run audit:us
npm run audit:us -- --small-towns
npm run audit:us -- --states=AK,HI
```

The manual **U.S. coverage audit** GitHub workflow supports the same capital/smaller-town selection and stores the result as an artifact. It is not run automatically on every PR.

Machine-readable snapshots: [capitals](us-latest.json), [smaller towns](us-small-towns-latest.json). Fixture list: [states and sample locations](us-states.json).

## Next coverage work

1. Add real address pairs and rural road destinations per state, including ferries, island routes and disconnected roads in Alaska.
2. Test cross-state trips and ambiguous city names from a different current map area.
3. Inventory actual airport floor/POI availability per venue. Adding a venue name does not create a floor plan.
4. Audit transit service and cycling independently.
5. Add browser journeys outside New York and physical low-end GPU measurements.

Provider references: [Mapbox Search Box](https://docs.mapbox.com/api/search/search-box/), [Directions](https://docs.mapbox.com/api/navigation/directions/), [Indoor v3](https://docs.mapbox.com/data/tilesets/reference/mapbox-indoor-v3/).
