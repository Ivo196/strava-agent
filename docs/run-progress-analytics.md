# Run progress analytics

The Carreras progress section is derived from stored running activities and the
current marathon-plan week. It never edits, merges, or deletes activity records.

## Period boundaries

- “7 days” includes the analysis date and the six preceding local dates. Its
  comparison window is the seven dates immediately before it.
- “28 days” follows the same rule with two adjacent 28-day windows.
- The four-week average divides each 28-day total by four.
- A percentage is omitted when the prior distance is below 3 km or the prior
  run count is zero. The UI says that there is no sufficient baseline instead.
- Weeks start on Monday. The weekly series fills empty weeks with zero and marks
  the in-progress current week explicitly.

## Quality and exclusions

- **Short activity:** less than 1.5 km or 10 moving minutes. It may still count
  as valid mileage, but it does not enter aerobic comparisons.
- **Incomplete data:** zero distance, zero moving time, or no usable pace. It is
  visible in history and excluded from aggregates and trends.
- **Possible duplicate:** starts within 20 minutes of another same-day activity,
  with distance within 8% and duration within 10%. Both records are flagged and
  remain visible; the later record is excluded from aggregates.
- **Outlier:** pace below 3:00 min/km or above 9:00 min/km, heart rate outside
  60–220 bpm, or more than 50 m of elevation gain per kilometer.
- **Possible walk:** pace above 8:30 min/km with no heart rate or heart rate below
  135 bpm.
- **Aerobic trend eligibility:** at least 5 km, pace 3:00–8:30 min/km, heart rate
  80–210 bpm, elevation at most 35 m/km, and none of the exclusions above.

## Aerobic comparison

Only the last 12 weeks are considered. Activities are grouped into 5–8 km,
8–12 km, and 12 km or longer. A group needs at least four eligible runs, at least
two in each six-week block, and no more than a 7 m/km difference in median
elevation between blocks. Median pace and median heart rate are compared so a
single extreme session cannot dominate the result.

The result is descriptive—similar pace with lower pulse, faster pace with similar
effort, higher recent pulse, or stable. It does not make medical conclusions.

## Consistency and long runs

Consistency uses recent weekly run counts, consecutive active weeks, gaps of 14
days or more, frequency variation, and current-plan adherence when present. The
long-run calculation compares the longest eligible run in each active week. An
increase is flagged as elevated only when it is at least 2 km and more than 20%
above the preceding weekly long run. The plan target is displayed only when the
training plan supplies one.
