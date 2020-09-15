const express = require('express')
const router = express.Router()
const db = require('../db')

// get world topN for specific date
router.post('/top10', async function(req, res) {
	const date = req.body.date;
	const year = parseInt(req.body.date.split('-')[0]);
	const cid = parseInt(req.body.cid);
	db.Async.any(`SELECT ${(cid == 1000) ? 'country.country_name as name' : 'divs.div_name as name'}, results.count FROM (
				SELECT ${(cid == 1000) ? 'country_id' : 'division_id'}, count(country_id) as count
				FROM dashboard.hotspots_${year}
				WHERE date = $1 ${(cid == 1000) ? '' : 'AND country_id = $2'}
				GROUP BY ${(cid == 1000) ? 'country_id' : 'division_id'}
				ORDER BY count desc LIMIT 5
			) as results
			LEFT JOIN ${(cid == 1000) ?
				'dashboard.countries country ON results.country_id = country.country_id' :
				'dashboard.countries_division divs ON results.division_id = divs.div_id'}
			ORDER BY count desc`, [date, cid])
	.then(function(data) {
		res.send(data);
	})
	.catch(function(error) {
		res.send(error);
	});
});


//==============================================//
// get quick hotspots numbers for specified day //
//==============================================//
router.post('/quickstats', async function(req, res) {
	const month = req.body.month.toString();
	const day = req.body.day.toString();
	const cid = parseInt(req.body.cid);
	const divid = parseInt(req.body.divid);

	// array of all values
	const dataArray = [];
	var avgSum = 0;

	// get a list of all hs tables, then go over them
	db.Async.any(`SELECT quote_ident(table_name) as name, COUNT(*) OVER ()
			FROM information_schema.tables
			WHERE table_schema = 'dashboard'
			AND table_name LIKE 'hotspots%'`)
	.then((tables) => {
		// go over them and get the hotspots count for a specific day
		tables.forEach((tbl) => {
			db.Async.any(`SELECT count(*)
					FROM dashboard.${tbl.name}
					-- if not global then leave the next bit, otherwise remove
					WHERE date_part('month', date)=$1 AND date_part('day', date)=$2
					${(cid !== 1000) ? ' AND country_id = $3' : ''}
					${(divid && cid !== 1000) ? ' AND division_id = $4' : ''}
					GROUP BY date`, [month, day, cid, divid])
			.then((out) => {
				var count = 0;
				if (out[0]) count = parseInt(out[0].count)
				else count = 0 

				// push new value to array
				avgSum += parseInt(count);
				dataArray.push({'year': tbl.name.split('_')[1], 'count': count})
				// and once we went through all of them => res.send
				if (dataArray.length == tbl.count) {
					res.send({'annual':dataArray, 'avgsum': (avgSum/dataArray.length)});
				}
			})
		});
	}).catch((err) => {
		// if first query have failed
		res.send(err);
	});
});
// get landcover stats for a specific day
router.post('/landcover', async function(req, res) {
	const date = req.body.date.toString();
	const year = parseInt(req.body.date.split('-')[0]);
	const cid = parseInt(req.body.cid);
	const divid = parseInt(req.body.divid);

	/*
	db.Async.any(`SELECT lc.lc_desc_min as name, count(*)
				FROM dashboard.hotspots_${year} h
				-- remove settlement, water and snow/ice
				RIGHT JOIN (
					SELECT * from dashboard.landcover
					WHERE lc_id_min<>7 AND lc_id_min<>9 AND lc_id_min<>10
				) AS lc
				ON lc.lc_id = h.landcover
				WHERE date = $1
				${(cid !== 1000) ? ' AND h.country_id = $2' : ''}
				${(divid && cid !== 1000) ? ' AND h.division_id = $3' : ''}
				GROUP BY lc.lc_desc_min
				ORDER BY count DESC`, [date, cid, divid])
	*/

	db.Async.any(`SELECT lc_desc_min as name, COALESCE(out.count, 0) as count from (
					SELECT lc_id_min, lc_desc_min
					FROM dashboard.landcover
					-- remove settlement, water and snow/ice
					WHERE lc_id_min<>7 AND lc_id_min<>9 AND lc_id_min<>10
					GROUP BY lc_id_min, lc_desc_min
				) as landcovers
				
				left join (
					SELECT lc.lc_desc_min as name, count(*)
					FROM dashboard.hotspots_${year} h
					RIGHT JOIN dashboard.landcover AS lc
					ON lc.lc_id = h.landcover
					WHERE date = $1
					${(cid !== 1000) ? ' AND h.country_id = $2' : ''}
					${(divid && cid !== 1000) ? ' AND h.division_id = $3' : ''}
					GROUP BY lc.lc_desc_min
					ORDER BY count desc
				) as out
				
				on out.name = landcovers.lc_desc_min
				ORDER BY count DESC`, [date, cid, divid])

	.then(function(data) {
		res.send(data);
	})
});

// get hotspots' stats for the whole year (10-day average)
router.post('/mainstats', async function(req, res) {
	const year = parseInt(req.body.date.split('-')[0]);
	const cid = parseInt(req.body.cid);
	const divid = parseInt(req.body.divid);
	db.Async.any(`SELECT final.date as x, final.count::float as y FROM (
					SELECT d.date, AVG(d.count)
					OVER(ORDER BY d.date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS count FROM (
						SELECT t1.date, COALESCE(t2.count, 0) as count FROM (
							SELECT generate_series(timestamp '${year}-01-01', timestamp '${year}-01-01' + interval '1 year - 1 day', interval '1 day') as date, 0 as count
						) as t1
						left join (
							SELECT date, count(*) FROM dashboard.hotspots_${year}
							${(cid !== 1000) ? 'WHERE country_id = $1' : ''}
							${(divid && cid !== 1000) ? ' AND division_id = $2' : ''}
							GROUP BY date ORDER BY date
						) as t2
						on t1.date = t2.date
					) AS d
				) AS final`, [cid, divid])
	.then(function(data) {
		res.send(data);
	})
});


// get long-term averages | async
router.post('/allavgstats', function(req, res) {
	const cid = parseInt(req.body.cid);
	const divid = parseInt(req.body.divid);
	let dataArray = [];

	// get a list of all hs tables, then go over them
	db.Async.any(`SELECT quote_ident(table_name) as name, COUNT(*) OVER ()
			FROM information_schema.tables
			WHERE table_schema = 'dashboard'
			AND table_name LIKE 'hotspots%'`)
	.then((tables) => {
		tables.forEach((tbl) => {
			const year = parseInt(tbl.name.split('_')[1]);
			db.Async.any(`SELECT final.date as x, final.count::float as y FROM (
							SELECT d.date, AVG(d.count)
							OVER(ORDER BY d.date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS count FROM (
								SELECT t1.date, COALESCE(t2.count, 0) as count from (
									SELECT generate_series(timestamp '${year}-01-01', timestamp '${year}-01-01' + interval '1 year - 1 day', interval '1 day') as date, 0 as count
								) as t1
								left join (
									SELECT * from dashboard.hotspots_${year}
									${(cid !== 1000) ? 'WHERE country_id = $1' : ''}
									${(divid && cid !== 1000) ? ' AND division_id = $2' : ''}
								) as t2
								on t1.date = t2.date
								group by t1.date --order by t1.date
							) AS d
						) AS final`, [cid, divid]).then((out) => {
							dataArray.push({'year': year, 'data': out})
							// and once we went through all of them => res.send
							if (dataArray.length == 20) {
								res.send(dataArray);
							}
						});
		});
	});
})


// get long-term averages | synchronous
router.post('/allavgstats_sync', function(req, res) {
	const cid = parseInt(req.body.cid);
	const divid = parseInt(req.body.divid);
	let dataArray = [];

	// get a list of all hs tables, then go over them
	db.Async.any(`SELECT quote_ident(table_name) as name, COUNT(*) OVER ()
				FROM information_schema.tables
				WHERE table_schema = 'dashboard'
				AND table_name LIKE 'hotspots%'`)
	.then((tables) => {
		tables.forEach((tbl) => {
			const year = parseInt(tbl.name.split('_')[1]);
			//prepared statements
			db.Sync.prepareSync(`get_year_${year}`, `
				SELECT final.date as x, final.count::float as y FROM (
					SELECT d.date, AVG(d.count)
					OVER(ORDER BY d.date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS count FROM (
						SELECT t1.date, COALESCE(t2.count, 0) as count from (
							SELECT generate_series(timestamp '${year}-01-01', timestamp '${year}-01-01' + interval '1 year - 1 day', interval '1 day') as date, 0 as count
						) as t1
						left join (
							SELECT * from dashboard.hotspots_${year}
							${(cid !== 1000) ? 'WHERE country_id = $1' : ''}
							${(divid && cid !== 1000) ? ' AND division_id = $2' : ''}
						) as t2
						on t1.date = t2.date
						group by t1.date --order by t1.date
					) AS d
				) AS final`, (divid)?2:1);
			let rows = db.Sync.executeSync(`get_year_${year}`, (divid)?[cid, divid]:[cid]);
			dataArray.push({'year': year, 'data': rows})
			// and once we went through all of them => res.send
			if (dataArray.length == tables.length) {
				res.send(dataArray);
			}
		});
	});
});

//=====================
// get all countries
router.get('/gcountry', async function(req, res) {
	db.Async.any(`SELECT * FROM dashboard.countries ORDER BY id ASC`)
	.then(function(data) {
		res.send(data);
	});
});
// and their subdivisions
router.get('/gdivs/:cid', async function(req, res) {
	const p = req.params;
	const cid = parseInt(p.cid);
	db.Async.any(`(SELECT div_id as id, div_name as name FROM dashboard.countries_division WHERE country_id = $1)
			UNION
			(SELECT 0, '-')
			ORDER BY name ASC`, [cid])
	.then(function(data) {
		res.send(data);
	});
});
// get country description id
router.get('/gdesc/:cid', async function(req, res) {
	const p = req.params;
	const cid = parseInt(p.cid);
	db.Async.one(`SELECT description FROM dashboard.countries WHERE country_id = $1`, [cid])
	.then(function(data) {
		res.send(data);
	});
});

module.exports = router