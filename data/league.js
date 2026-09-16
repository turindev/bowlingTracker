/*
 * League data — this is the only file you edit to add scores.
 *
 * It is plain JSON wrapped in one assignment so the site works both on a web
 * host and by opening index.html straight off disk (no server, no build step).
 *
 * See tools/SCHEMA.md for the field reference, and run `node tools/validate.js`
 * after editing to catch typos before they reach the page.
 *
 * Week 1 note: the printed sheet had teams 7 and 8 under each other's names.
 * The roster it labelled "Team 7" is really 8 - Bowler's Anonymous, and that
 * correction is already applied here.
 */
window.LEAGUE_DATA =
{
  "league": {
    "name": "Championship League 2026-27",
    "season": "2026-27",
    "venue": "Leisure Time Bowling",
    "night": "Tuesdays, 6:30 PM",
    "weeksInSeason": 32
  },
  "scoring": {
    "gamesPerWeek": 3,
    "useHandicap": true,
    "handicapBasis": 220,
    "handicapPercent": 90,
    "pointsPerGame": 1,
    "pointsForSeries": 1
  },
  "teams": [
    {
      "id": "t1",
      "name": "Strike Scratch Fever"
    },
    {
      "id": "t2",
      "name": "Warriors"
    },
    {
      "id": "t3",
      "name": "Old School"
    },
    {
      "id": "t4",
      "name": "Team 4"
    },
    {
      "id": "t5",
      "name": "9 Pin City"
    },
    {
      "id": "t6",
      "name": "House Hacks"
    },
    {
      "id": "t7",
      "name": "Team 7"
    },
    {
      "id": "t8",
      "name": "Bowler's Anonymous"
    },
    {
      "id": "t9",
      "name": "We Got This"
    },
    {
      "id": "t10",
      "name": "Team 10"
    },
    {
      "id": "t11",
      "name": "We The People"
    },
    {
      "id": "t12",
      "name": "Hookers and Bowl"
    },
    {
      "id": "t13",
      "name": "Armenian Noodle Dippers"
    },
    {
      "id": "t14",
      "name": "Team 14"
    },
    {
      "id": "t15",
      "name": "Nutz Out Da Back"
    },
    {
      "id": "t16",
      "name": "Balls Out"
    },
    {
      "id": "t17",
      "name": "Ruthless"
    },
    {
      "id": "t18",
      "name": "Team 18"
    },
    {
      "id": "t19",
      "name": "Big Orange Bowling"
    },
    {
      "id": "t20",
      "name": "Jesse's Gym"
    },
    {
      "id": "t21",
      "name": "Bowling Buddies"
    },
    {
      "id": "t22",
      "name": "Team 22"
    },
    {
      "id": "t23",
      "name": "Stars & Strikes"
    },
    {
      "id": "t24",
      "name": "Team 24"
    }
  ],
  "players": [
    {
      "id": "p1",
      "name": "Ken Grizzard",
      "teamId": "t1",
      "entryAverage": 160
    },
    {
      "id": "p2",
      "name": "Ed Curtis",
      "teamId": "t1",
      "entryAverage": 144
    },
    {
      "id": "p3",
      "name": "Marty Tate",
      "teamId": "t1",
      "entryAverage": 167
    },
    {
      "id": "p4",
      "name": "Rick Goodwin",
      "teamId": "t1",
      "entryAverage": 159
    },
    {
      "id": "p5",
      "name": "Leon Farmer",
      "teamId": "t2",
      "entryAverage": 195
    },
    {
      "id": "p6",
      "name": "Jon Boxwell",
      "teamId": "t2",
      "entryAverage": 186
    },
    {
      "id": "p7",
      "name": "Terry Cranfield",
      "teamId": "t2",
      "entryAverage": 187
    },
    {
      "id": "p8",
      "name": "Tony Bullington",
      "teamId": "t2",
      "entryAverage": 204
    },
    {
      "id": "p9",
      "name": "Toby Crisp",
      "teamId": "t3",
      "entryAverage": 204
    },
    {
      "id": "p10",
      "name": "Wendell Defriece",
      "teamId": "t3",
      "entryAverage": 208
    },
    {
      "id": "p11",
      "name": "Robbie Defriece",
      "teamId": "t3",
      "entryAverage": 205
    },
    {
      "id": "p12",
      "name": "Keith White",
      "teamId": "t3",
      "entryAverage": 226
    },
    {
      "id": "p13",
      "name": "Jason Thompson",
      "teamId": "t4",
      "entryAverage": 141
    },
    {
      "id": "p14",
      "name": "Ben Deloach",
      "teamId": "t4",
      "entryAverage": 244
    },
    {
      "id": "p15",
      "name": "Jason Seda-Haas",
      "teamId": "t4",
      "entryAverage": 200
    },
    {
      "id": "p16",
      "name": "Darius Thompson",
      "teamId": "t4",
      "entryAverage": 242
    },
    {
      "id": "p17",
      "name": "Steven Monroe",
      "teamId": "t5",
      "entryAverage": 205
    },
    {
      "id": "p18",
      "name": "Aaron Jones",
      "teamId": "t5",
      "entryAverage": 158
    },
    {
      "id": "p19",
      "name": "Dale Dutcher",
      "teamId": "t5",
      "entryAverage": 171
    },
    {
      "id": "p20",
      "name": "Daryl Blair",
      "teamId": "t5",
      "entryAverage": 162
    },
    {
      "id": "p21",
      "name": "Spencer Foutz",
      "teamId": "t6",
      "entryAverage": 209
    },
    {
      "id": "p22",
      "name": "Cam Miller",
      "teamId": "t6",
      "entryAverage": 196
    },
    {
      "id": "p23",
      "name": "Worm Davis",
      "teamId": "t6",
      "entryAverage": 212
    },
    {
      "id": "p24",
      "name": "Alex Davis",
      "teamId": "t6",
      "entryAverage": 225
    },
    {
      "id": "p25",
      "name": "Steve Smith",
      "teamId": "t8",
      "entryAverage": 191
    },
    {
      "id": "p27",
      "name": "Nick Grabe",
      "teamId": "t8",
      "entryAverage": 158
    },
    {
      "id": "p26",
      "name": "Starr Jensen",
      "teamId": "t8",
      "entryAverage": 154
    },
    {
      "id": "p28",
      "name": "Mike Davis",
      "teamId": "t8",
      "entryAverage": 143
    },
    {
      "id": "p30",
      "name": "Davis Segui",
      "teamId": "t7",
      "entryAverage": 180
    },
    {
      "id": "p29",
      "name": "Jim Sedgwick",
      "teamId": "t7",
      "entryAverage": 159
    },
    {
      "id": "p31",
      "name": "James Duffee",
      "teamId": "t7",
      "entryAverage": 186
    },
    {
      "id": "p32",
      "name": "Vacant",
      "teamId": "t7",
      "entryAverage": 120,
      "placeholder": true
    },
    {
      "id": "p33",
      "name": "Rodney Benefield",
      "teamId": "t9",
      "entryAverage": 173
    },
    {
      "id": "p34",
      "name": "Tim Carlson",
      "teamId": "t9",
      "entryAverage": 176
    },
    {
      "id": "p35",
      "name": "Darrell Smith",
      "teamId": "t9",
      "entryAverage": 188
    },
    {
      "id": "p36",
      "name": "Bobby Bryant",
      "teamId": "t9",
      "entryAverage": 182
    },
    {
      "id": "p37",
      "name": "Jeremy Malek",
      "teamId": "t10",
      "entryAverage": 203
    },
    {
      "id": "p38",
      "name": "Kamus Thompson",
      "teamId": "t10",
      "entryAverage": 195
    },
    {
      "id": "p39",
      "name": "John Jenner",
      "teamId": "t10",
      "entryAverage": 198
    },
    {
      "id": "p40",
      "name": "Derek Banther",
      "teamId": "t10",
      "entryAverage": 206
    },
    {
      "id": "p41",
      "name": "Josh Malek",
      "teamId": "t11",
      "entryAverage": 189
    },
    {
      "id": "p42",
      "name": "Chad Clark",
      "teamId": "t11",
      "entryAverage": 185
    },
    {
      "id": "p43",
      "name": "Jimmy Malek",
      "teamId": "t11",
      "entryAverage": 197
    },
    {
      "id": "p44",
      "name": "Josh Bomboy",
      "teamId": "t11",
      "entryAverage": 205
    },
    {
      "id": "p45",
      "name": "Randy Dockery",
      "teamId": "t12",
      "entryAverage": 180
    },
    {
      "id": "p46",
      "name": "Shayne Terry",
      "teamId": "t12",
      "entryAverage": 204
    },
    {
      "id": "p47",
      "name": "Cody LaCroix",
      "teamId": "t12",
      "entryAverage": 194
    },
    {
      "id": "p48",
      "name": "Jayson Scoggins",
      "teamId": "t12",
      "entryAverage": 202
    },
    {
      "id": "p49",
      "name": "Chad Green",
      "teamId": "t13",
      "entryAverage": 206
    },
    {
      "id": "p50",
      "name": "Lynn Collins",
      "teamId": "t13",
      "entryAverage": 208
    },
    {
      "id": "p51",
      "name": "Chris Neal",
      "teamId": "t13",
      "entryAverage": 224
    },
    {
      "id": "p52",
      "name": "Steven Adler",
      "teamId": "t13",
      "entryAverage": 232
    },
    {
      "id": "p53",
      "name": "Yogi Cabrera",
      "teamId": "t14",
      "entryAverage": 171
    },
    {
      "id": "p54",
      "name": "Mitchell Mayo",
      "teamId": "t14",
      "entryAverage": 208
    },
    {
      "id": "p55",
      "name": "Duane Mayo",
      "teamId": "t14",
      "entryAverage": 167
    },
    {
      "id": "p56",
      "name": "Mark Youngblood",
      "teamId": "t14",
      "entryAverage": 200
    },
    {
      "id": "p57",
      "name": "Hunter Moffitt",
      "teamId": "t15",
      "entryAverage": 203
    },
    {
      "id": "p58",
      "name": "Chris Daughtry",
      "teamId": "t15",
      "entryAverage": 217
    },
    {
      "id": "p59",
      "name": "Cameron Compton",
      "teamId": "t15",
      "entryAverage": 210
    },
    {
      "id": "p60",
      "name": "Vacant",
      "teamId": "t15",
      "entryAverage": 120,
      "placeholder": true
    },
    {
      "id": "p61",
      "name": "John Linan",
      "teamId": "t16",
      "entryAverage": 138
    },
    {
      "id": "p62",
      "name": "Stan Stinnett",
      "teamId": "t16",
      "entryAverage": 163
    },
    {
      "id": "p63",
      "name": "Matt Linan",
      "teamId": "t16",
      "entryAverage": 186
    },
    {
      "id": "p64",
      "name": "Stonewall Stinnett",
      "teamId": "t16",
      "entryAverage": 182
    },
    {
      "id": "p65",
      "name": "Hamilton Hickman",
      "teamId": "t17",
      "entryAverage": 172
    },
    {
      "id": "p66",
      "name": "Ken Ellis",
      "teamId": "t17",
      "entryAverage": 163
    },
    {
      "id": "p67",
      "name": "Richard Simpson",
      "teamId": "t17",
      "entryAverage": 181
    },
    {
      "id": "p68",
      "name": "Joey Zinn",
      "teamId": "t17",
      "entryAverage": 178
    },
    {
      "id": "p69",
      "name": "Butch Finkbeiner",
      "teamId": "t18",
      "entryAverage": 134
    },
    {
      "id": "p70",
      "name": "Treifor Grant",
      "teamId": "t18",
      "entryAverage": 133
    },
    {
      "id": "p71",
      "name": "Paul Queen",
      "teamId": "t18",
      "entryAverage": 145
    },
    {
      "id": "p72",
      "name": "Jerry Lance",
      "teamId": "t18",
      "entryAverage": 167
    },
    {
      "id": "p73",
      "name": "Tanner Collins",
      "teamId": "t19",
      "entryAverage": 194
    },
    {
      "id": "p74",
      "name": "Chuck Broesche",
      "teamId": "t19",
      "entryAverage": 135
    },
    {
      "id": "p75",
      "name": "Mark Thompson",
      "teamId": "t19",
      "entryAverage": 208
    },
    {
      "id": "p76",
      "name": "Jared King",
      "teamId": "t19",
      "entryAverage": 203
    },
    {
      "id": "p77",
      "name": "Jesse Cabrera",
      "teamId": "t20",
      "entryAverage": 163
    },
    {
      "id": "p79",
      "name": "Thomas Woody",
      "teamId": "t20",
      "entryAverage": 159
    },
    {
      "id": "p80",
      "name": "Tim Berthianne",
      "teamId": "t20",
      "entryAverage": 199
    },
    {
      "id": "p97",
      "name": "Matthew Spicer",
      "teamId": "t20",
      "entryAverage": 221,
      "substitute": true
    },
    {
      "id": "p81",
      "name": "Coty Rymer",
      "teamId": "t21",
      "entryAverage": 239
    },
    {
      "id": "p82",
      "name": "Sam Hunter",
      "teamId": "t21",
      "entryAverage": 182
    },
    {
      "id": "p83",
      "name": "Todd Deluca",
      "teamId": "t21",
      "entryAverage": 175
    },
    {
      "id": "p84",
      "name": "John Hancock",
      "teamId": "t21",
      "entryAverage": 215
    },
    {
      "id": "p85",
      "name": "Porky Davis",
      "teamId": "t22",
      "entryAverage": 199
    },
    {
      "id": "p86",
      "name": "Bryant Johns",
      "teamId": "t22",
      "entryAverage": 184
    },
    {
      "id": "p87",
      "name": "Tanner Kincaid",
      "teamId": "t22",
      "entryAverage": 205
    },
    {
      "id": "p88",
      "name": "Lenny Kersten",
      "teamId": "t22",
      "entryAverage": 203
    },
    {
      "id": "p89",
      "name": "Al Veitor",
      "teamId": "t23",
      "entryAverage": 162
    },
    {
      "id": "p90",
      "name": "Matt Rayfield",
      "teamId": "t23",
      "entryAverage": 130
    },
    {
      "id": "p91",
      "name": "Jimmy Cambell",
      "teamId": "t23",
      "entryAverage": 168
    },
    {
      "id": "p92",
      "name": "Tyler Green",
      "teamId": "t23",
      "entryAverage": 163
    },
    {
      "id": "p93",
      "name": "Absentee",
      "teamId": "t24",
      "entryAverage": 220,
      "placeholder": true
    },
    {
      "id": "p94",
      "name": "Michael Shipley",
      "teamId": "t24",
      "entryAverage": 210
    },
    {
      "id": "p95",
      "name": "Absentee",
      "teamId": "t24",
      "entryAverage": 220,
      "placeholder": true
    },
    {
      "id": "p96",
      "name": "Oliver Lawson",
      "teamId": "t24",
      "entryAverage": 230
    }
  ],
  "weeks": [
    {
      "number": 1,
      "date": "2026-09-08",
      "scores": [
        {
          "playerId": "p1",
          "games": [177, 130, 164]
        },
        {
          "playerId": "p2",
          "games": [186, 123, 158]
        },
        {
          "playerId": "p3",
          "games": [156, 162, 163]
        },
        {
          "playerId": "p4",
          "games": [160, 153, 194]
        },
        {
          "playerId": "p5",
          "games": [192, 160, 172]
        },
        {
          "playerId": "p6",
          "games": [195, 160, 190]
        },
        {
          "playerId": "p7",
          "games": [151, 151, 190]
        },
        {
          "playerId": "p8",
          "games": [190, 203, 198]
        },
        {
          "playerId": "p9",
          "games": [144, 189, 159]
        },
        {
          "playerId": "p10",
          "games": [225, 182, 183]
        },
        {
          "playerId": "p11",
          "games": [205, 205, 181]
        },
        {
          "playerId": "p12",
          "games": [191, 248, 237]
        },
        {
          "playerId": "p13",
          "games": [146, 154, 123]
        },
        {
          "playerId": "p14",
          "games": [198, 268, 268]
        },
        {
          "playerId": "p15",
          "games": [170, 223, 170]
        },
        {
          "playerId": "p16",
          "games": [249, 213, 266]
        },
        {
          "playerId": "p17",
          "games": [258, 163, 243]
        },
        {
          "playerId": "p18",
          "games": [160, 115, 170]
        },
        {
          "playerId": "p19",
          "games": [199, 190, 172]
        },
        {
          "playerId": "p20",
          "games": [149, 191, 153]
        },
        {
          "playerId": "p21",
          "games": [289, 214, 279]
        },
        {
          "playerId": "p22",
          "games": [236, 220, 236]
        },
        {
          "playerId": "p23",
          "games": [192, 182, 169]
        },
        {
          "playerId": "p24",
          "games": [214, 247, 210]
        },
        {
          "playerId": "p25",
          "games": [204, 178, 193]
        },
        {
          "playerId": "p27",
          "games": [176, 148, 152]
        },
        {
          "playerId": "p26",
          "games": [161, 153, 148]
        },
        {
          "playerId": "p28",
          "games": [132, 158, 139]
        },
        {
          "playerId": "p30",
          "games": [133, 139, 189]
        },
        {
          "playerId": "p29",
          "games": [168, 191, 157]
        },
        {
          "playerId": "p31",
          "games": [203, 214, 191]
        },
        {
          "playerId": "p32",
          "games": [120, 120, 120]
        },
        {
          "playerId": "p33",
          "games": [169, 139, 191]
        },
        {
          "playerId": "p34",
          "games": [172, 166, 226]
        },
        {
          "playerId": "p35",
          "games": [197, 217, 190]
        },
        {
          "playerId": "p36",
          "games": [179, 130, 191]
        },
        {
          "playerId": "p37",
          "games": [201, 190, 201]
        },
        {
          "playerId": "p38",
          "games": [217, 207, 218]
        },
        {
          "playerId": "p39",
          "games": [222, 139, 200]
        },
        {
          "playerId": "p40",
          "games": [181, 201, 208]
        },
        {
          "playerId": "p41",
          "games": [167, 184, 139]
        },
        {
          "playerId": "p42",
          "games": [179, 170, 194]
        },
        {
          "playerId": "p43",
          "games": [144, 200, 173]
        },
        {
          "playerId": "p44",
          "games": [216, 194, 205]
        },
        {
          "playerId": "p45",
          "games": [168, 199, 180]
        },
        {
          "playerId": "p46",
          "games": [192, 178, 194]
        },
        {
          "playerId": "p47",
          "games": [185, 186, 236]
        },
        {
          "playerId": "p48",
          "games": [178, 151, 214]
        },
        {
          "playerId": "p49",
          "games": [217, 199, 205]
        },
        {
          "playerId": "p50",
          "games": [190, 157, 199]
        },
        {
          "playerId": "p51",
          "games": [213, 222, 177]
        },
        {
          "playerId": "p52",
          "games": [200, 247, 216]
        },
        {
          "playerId": "p53",
          "games": [165, 177, 130]
        },
        {
          "playerId": "p54",
          "games": [178, 216, 233]
        },
        {
          "playerId": "p55",
          "games": [114, 154, 181]
        },
        {
          "playerId": "p56",
          "games": [169, 203, 174]
        },
        {
          "playerId": "p57",
          "games": [182, 186, 243]
        },
        {
          "playerId": "p58",
          "games": [237, 191, 224]
        },
        {
          "playerId": "p59",
          "games": [226, 232, 182]
        },
        {
          "playerId": "p60",
          "games": [120, 120, 120]
        },
        {
          "playerId": "p61",
          "games": [181, 134, 159]
        },
        {
          "playerId": "p62",
          "games": [137, 182, 188]
        },
        {
          "playerId": "p63",
          "games": [189, 236, 170]
        },
        {
          "playerId": "p64",
          "games": [182, 195, 170]
        },
        {
          "playerId": "p65",
          "games": [164, 167, 224]
        },
        {
          "playerId": "p66",
          "games": [166, 170, 202]
        },
        {
          "playerId": "p67",
          "games": [199, 155, 202]
        },
        {
          "playerId": "p68",
          "games": [192, 225, 168]
        },
        {
          "playerId": "p69",
          "games": [186, 171, 125]
        },
        {
          "playerId": "p70",
          "games": [116, 153, 168]
        },
        {
          "playerId": "p71",
          "games": [170, 125, 144]
        },
        {
          "playerId": "p72",
          "games": [149, 183, 170]
        },
        {
          "playerId": "p73",
          "games": [254, 212, 160]
        },
        {
          "playerId": "p74",
          "games": [114, 124, 168]
        },
        {
          "playerId": "p75",
          "games": [206, 203, 193]
        },
        {
          "playerId": "p76",
          "games": [203, 245, 197]
        },
        {
          "playerId": "p77",
          "games": [169, 147, 169]
        },
        {
          "playerId": "p79",
          "games": [135, 135, 148]
        },
        {
          "playerId": "p80",
          "games": [217, 194, 187]
        },
        {
          "playerId": "p97",
          "games": [215, 171, 247]
        },
        {
          "playerId": "p81",
          "games": [231, 245, 167]
        },
        {
          "playerId": "p82",
          "games": [134, 196, 178]
        },
        {
          "playerId": "p83",
          "games": [189, 202, 172]
        },
        {
          "playerId": "p84",
          "games": [245, 287, 194]
        },
        {
          "playerId": "p85",
          "games": [227, 150, 194]
        },
        {
          "playerId": "p86",
          "games": [178, 191, 183]
        },
        {
          "playerId": "p87",
          "games": [165, 178, 237]
        },
        {
          "playerId": "p88",
          "games": [159, 211, 212]
        },
        {
          "playerId": "p89",
          "games": [136, 122, 174]
        },
        {
          "playerId": "p90",
          "games": [144, 132, 131]
        },
        {
          "playerId": "p91",
          "games": [180, 177, 184]
        },
        {
          "playerId": "p92",
          "games": [164, 191, 182]
        },
        {
          "playerId": "p93",
          "games": [210, 210, 210]
        },
        {
          "playerId": "p94",
          "games": [193, 174, 211]
        },
        {
          "playerId": "p95",
          "games": [210, 210, 210]
        },
        {
          "playerId": "p96",
          "games": [258, 182, 243]
        }
      ],
      "matches": [
        {
          "homeTeamId": "t1",
          "awayTeamId": "t2"
        },
        {
          "homeTeamId": "t3",
          "awayTeamId": "t4"
        },
        {
          "homeTeamId": "t5",
          "awayTeamId": "t6"
        },
        {
          "homeTeamId": "t7",
          "awayTeamId": "t8"
        },
        {
          "homeTeamId": "t9",
          "awayTeamId": "t10"
        },
        {
          "homeTeamId": "t11",
          "awayTeamId": "t12"
        },
        {
          "homeTeamId": "t13",
          "awayTeamId": "t14"
        },
        {
          "homeTeamId": "t15",
          "awayTeamId": "t16"
        },
        {
          "homeTeamId": "t17",
          "awayTeamId": "t18"
        },
        {
          "homeTeamId": "t19",
          "awayTeamId": "t20"
        },
        {
          "homeTeamId": "t21",
          "awayTeamId": "t22"
        },
        {
          "homeTeamId": "t23",
          "awayTeamId": "t24"
        }
      ]
    }
  ]
};
