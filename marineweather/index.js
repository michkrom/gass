'use strict';

// set up webhook request handler (boilerplate code)
const functions = require('firebase-functions');
exports.dialogflowFirebaseFulfillment = functions.https.onRequest(requestHandler);
// the requestHandler uses WebhookClient (dialog flow library)
const {WebhookClient} = require('dialogflow-fulfillment');
process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

//////////////////////////////////////////////////////////////////////////////////////

function pad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

function round(num,places) {
    var d = Math.pow(10,places);
    return Math.round(num*d)/d;
}

function time24to12str(h,m,round) {
    if(round){
        var t = h * 60 + m + round/2;
        t = Math.floor( t / round ) * round;
        h = Math.floor(t / 60) % 24;
        m = t % 60;
    }
    return pad(h > 12 ? h - 12 : (h===0 ? 12 : h), 2)+":"+pad(m,2)+(h >= 12 ? 'PM' : 'AM');
}

function time24to12Oclockstr(h,m) {
    var round = 60;
    var t = h * 60 + m + round/2;
    t = Math.floor( t / round ) * round;
    h = Math.floor(t / 60) % 24;
    return pad(h > 12 ? h - 12 : (h===0 ? 12 : h), 2)+(h >= 12 ? 'PM' : 'AM');
}

function date2str(d)
{
    return d.getFullYear()+pad(d.getMonth()+1,2)+pad(d.getDate(),2) + " " + pad(d.getHours(),2) + ":" + pad(d.getMinutes(),2);
}

function getNextTextElement(jq){
    try {
    	var elem = jq[0].nextSibling;
    	while(elem && elem.nodeType != 3 /*text*/) 
    		elem = elem.nextSibling;
    	return elem ? elem.data : null;
    }
    catch(ex){
    }
    return null;
}

// e.g. <div id="tbb_wind_speed_mph">15.96</div>
function getNumberById($, id)
{
    try{
        var e = $("#"+id);
        console.log(id + " --->" + e);
        var txt = e.text();
        console.log(txt);
        var n = Number(txt);
        if(!isNaN(n)) 
            return n;
    } catch(ex) {
        console.log(ex);
    }
    return null;
}

//////////////////////////////////////////////////////////////////////////////////////

const UAs = [
    'Mozilla/5.0 (X11; Linux i686) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/66.0.3359.181 Chrome/66.0.3359.181 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134',
	'Mozilla/5.0 (X11; Ubuntu; Linux i686; rv:61.0) Gecko/20100101 Firefox/61.0'
];

const node_fetch = require('node-fetch');

function fetch(url, opt) {
  if(opt == null) opt = {};
  opt.headers = {'User-Agent': UAs[Math.floor(Math.random() * Math.floor(UAs.length))]};
  return node_fetch(url,opt).then(res => res.text());
}

function fetchJson(url, opt) {
    if(opt == null) opt = {};
    opt.headers = {'User-Agent': UAs[Math.floor(Math.random() * Math.floor(UAs.length))]};
    return node_fetch(url,opt).then(res => res.ok ? res.json() : null);
  }
  
//////////////////////////////////////////////////////////////////////////////////////

function testWrap(msg,promise) {
    return promise
        .then((resp) => {
            console.log(msg + ' than()');
            return resp;
        })
        .catch((err)=> {
            console.log(msg+' catch() err='+err);
            return err;
        });
}

//////////////////////////////////////////////////////////////////////////////////////

// returns a promise search for location using arcis
// returns object { candidates: [ location: { x: lon, y: lat } ] }
function promiseToFetchGeocode(location)
{    
    console.log('fetching geocode for '+location);
    const URL = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates';
    return fetchJson(URL+'?f=pjson&singleLine='+location);
}

//////////////////////////////////////////////////////////////////////////////////////

const cheerio = require('cheerio');

//////////////////////////////////////////////////////////////////////////////////////

// observation schema is :
// name, lat, lon, date, 
// speed, gust, direction, 
// air, water, dewpoint, preassure, 
// swell, seas, peakperiod, sweldir

//////////////////////////////////////////////////////////////////////////////////////

function promiseToFetchTidesStationObs(id) {
    var url = "https://tidesandcurrents.noaa.gov/api/datagetter?application=NOS.COOPS.TAC.MET&date=latest&time_zone=LST&units=english&interval=6&format=json";
    url += "&station="+id;
    url += "&product=wind";
    console.log("fetching " + url);
	return fetchJson(url)
	.then((js)=>{
	    console.log('promiseToFetchTidesStationObs got for  '+id);
	    //{"metadata":{"id":"9415020","name":"Point Reyes","lat":"37.9961","lon":"-122.9767"},
	   // "data":[{"t":"2018-10-07 11:54", "s":"20.41", "d":"291.00", "dr":"WNW", "g":"23.71", "f":"0,0"}]}
	    var o = {};
	    o.name = js.name;
	    o.id = js.id;
	    o.lat = js.lat;
	    o.lon = js.lon;
	    o.date = js.data[0].date;
	    o.speed = js.data[0].s;
	    o.gust = js.data[0].g;
	    o.direction = js.data[0].d;
		return o;
    })
    .catch((err)=>{
        console.log("promiseToFetchTidesStationObs:"+err);
    });
}

//////////////////////////////////////////////////////////////////////////////////////

function buoy2json(html) {
	var b = {};
	var m = html.match(/Station\s*([a-zA-Z0-9]+)/);
	if(m) b.name = m[0];
	m = html.match(/([0-9.]+[NS])\s*([0-9.]+[WE])/);
	if(m) { b.lat = m[1]; b.lon = m[2]; }
	m = html.match(/\d+:\d+\s*[apm]+\s*\w+\s*[0-9/]+/);
	if(m) { b.date = m[0]; }
	m = html.match(/Wind:\s*[NWSE]+\s*[(](\d+).*[)]\s*,\s*([0-9.]+)/);
	if(m) { b.speed = m[2] * 1.15  /*KN -> MPH*/;  b.direction = m[1]; }
	m = html.match(/Gust:\s*([0-9.]+)/);
	if(m) { b.gust = m[1]; }
	m = html.match(/Seas:\s*([0-9.]+)/);
	if(m) { b.seas = m[1]; }
	m = html.match(/Peak period:\s*([0-9.]+)/);
	if(m) { b.peakperiod = m[1]; }
	m = html.match(/Air Temp:\s*([0-9.]+)/);
	if(m) { b.air = m[1]; }
	m = html.match(/Water Temp:\s*([0-9.]+)/);
	if(m) { b.water = m[1]; }
	m = html.match(/Dew Point:\s*([0-9.]+)/);
	if(m) { b.dewpoint = m[1]; }
	m = html.match(/Pres\w*:\s*([0-9.]+)/);
	if(m) { b.preassure = m[1]; }
	m = html.match(/Swell:\s*([0-9.]+)/);
	if(m) { b.swell = m[1]; }
	m = html.match(/Direction:\s*([NWSE]+)/);
	if(m) { b.swelldir = m[1]; }
	return b;
}

//////////////////////////////////////////////////////////////////////////////////////

function promiseToFetchNoaaBuoy(id) {
	var url = "https://www.ndbc.noaa.gov/mini_station_page.php?station=" + id;
	return fetch(url)
	.then((html)=>{
	    console.log('fetched NOAA BUOY '+id);
		return buoy2json(html);
	})
    .catch((err) => {
      console.log("promiseToFetchNoaaBuoy:" + err);
    });
}

//////////////////////////////////////////////////////////////////////////////////////

const BoonUrl = "https://boonproducts.ucdavis.edu/cgi-bin/dyn.pl?source=brt2&names=aqm_aqi,aqm_co2_conc_num,bml_met_air_temperature_degf,bml_met_air_temperature_degc,bml_met_wind_speed_mph,bml_met_wind_speed_kts,bml_met_wind_direction_degn,bml_met_barometric_pressure_mbar,bml_met_barometric_pressure_inhg,bml_met_relative_humidity_percent,bml_met_par_units,bml_met_solar_radiation_wpsqm,bml_met_rainfall_lasthour,bml_met_rainfall_last24hours,bml_met_rainfall_last7days,bml_met_rainfall_last30days,bml_met_rainfall_ytd,bml_met_rainfall_sincejul,bml_met_rainfall_sinceoct,bml_met_rainfall_last48hours,bml_met_rainfall_lasthour_percent,bml_met_rainfall_last24hours_percent,bml_met_rainfall_last48hours_percent,bml_met_rainfall_last7days_percent,bml_met_rainfall_last30days_percent,bml_met_rainfall_ytd_percent,bml_met_rainfall_sincejul_percent,bml_met_rainfall_sinceoct_percent,bml_ctd_temperature_degf,bml_ctd_temperature_degc,bml_ctd_salinity_ppt,bml_ctd_density_gpcc,bml_ctd_conductivity_spm,bml_wwqm_temperature_degf,bml_wwqm_temperature_degc,bml_wwqm_salinity_ppt,bml_wwqm_chlorophyll_ugpl,bml_wwqm_oxygen_saturation_units,bml_wwqm_dissolved_oxygen_units,bml_wwqm_turbidity_ntu,bml_wwqm_conductivity_spm,bml_wwqm_water_pressure_dbar,tbb_ctd_temperature_degf,tbb_ctd_temperature_degc,tbb_ctd_salinity_ppt,tbb_flntu_chlorophyll_ugpl,tbb_ctd_conductivity_spm,tbb_ctd_density_gpcc,tbb_flntu_turbidity_ntu,tbb_wind_speed_mph,fp_ctd_temperature_degf,fp_ctd_temperature_degc,fp_ctd_salinity_ppt,fp_ctd_fluorescence_raw,fp_ctd_conductivity_spm,fp_ctd_pressure_dbar,fp_ctd_density_gpcc,fp_ctd_transmittance_raw,esrl_met_wind_speed_mph,esrl_met_wind_speed_kts,esrl_met_wind_direction_degn,comp_met_wind_speed_mph,comp_met_wind_direction_degn,datetimelocal";

// tags could be bml or tbb
function promiseToFetchBoon() {
    return fetchJson(BoonUrl)
    .then((json) => {
        console.log('fetched BOON data: '+BoonUrl);
        var x = {};
        x.name = 'Bodega Head';
        x.direction = Number(json.bml_met_wind_direction_degn);
        x.speed = Number(json.bml_met_wind_speed_mph);
        x.air = Number(json.bml_met_air_temperature_degf);
        var y = {};
        y.name = 'Tomales Buoy';
        //y.direction = Number(json.tbb_wind_direction_degn);
        y.speed = Number(json.tbb_wind_speed_mph);
        y.water = Number(json.tbb_ctd_temperature_degf);

        var z = {};
        z.name = 'Boadega Head NOAA';
        z.direction = Number(json.esrl_met_wind_direction_degn);
        z.speed = Number(json.esrl_met_wind_speed_mph);

        return { bodega: x, boonnoaa: z, tomales: y };
    })
    .catch((err) => {
        console.log("promiseToFetchBoon:" + err);
    });
}

//////////////////////////////////////////////////////////////////////////////////////

function promiseToFetchPoreLt(){
    return fetch('https://www.nps.gov/featurecontent/ard/webcams//json/porejson.txt?uuid=9dff41d5-00c7-1d22-75f1-3a4408f4216d&_=1530402731268')
    .then((body) => {
        console.log('fetched PORE LH');            
        var $ = JSON.parse(body);
        //console.log($);
        var pore = {};
        pore.name = "Point Rayes Lighthouse";
        pore.direction = Number($.SITE1.WD.degrees);
        pore.speed = Number($.SITE1.WS.hourly);
        if(pore.speed < 0)
        {
            pore.speed = null;
            pore.direction = null;
        }
        pore.air = Number($.SITE1.AT.hourly);
        return pore;
    })
    .catch((err) => {
        console.log("promiseToFetchPoreLt:" + err);
    });
}

//////////////////////////////////////////////////////////////////////////////////////

// return a promise to fetch meteo information for bodega,tomales,pore
function promiseFetchMeteo() {	
	var obs = {};
	var p = [
        promiseToFetchBoon()
        .then((data) => { 
            if(data != null)
            {
                obs.bodega = data.bodega;
                obs.tomales = data.tomales;
                obs.boonnoaa = data.boonnoaa;
            }
        }).catch((err) => {
            console.log(err);
        }),
		promiseToFetchNoaaBuoy('46013')
		.then((buoy) => {
            if(buoy != null)
            {
                obs.bodegabuoy = buoy;
                obs.bodegabuoy.name = 'Bodega Buoy';
            }
		}).catch((err) => {
            console.log(err);
        }),
        // promiseToFetchPoreLt().then((obs2)=>{
        //     obs.porelt = obs2;
        //     obs.porelt.name = "Reyes Lighthouse";
        // }).catch((err) => {
        //     console.log(err);
        // }),
		// promiseToFetchTidesStationObs('9415020')
		// .then((data) => {
        //     obs.chimney = data;
        //     obs.chimney.name = 'Chimney Rock';
		// }).catch((err) => {
        //     console.log(err);
        // }),
		// promiseToFetchNoaaBuoy('PRYC1')
		// .then((buoy) => {
		//     obs.porebuoy = buoy;
		//     obs.porebuoy.name = 'Reyes Buoy';
        // }).catch((err) => {
        //     console.log(err);
        // })
    	];
    return Promise.all(p)
        .then(()=>{return obs;})
        .catch((err) => {
            console.log(err);
        });
}

//////////////////////////////////////////////////////////////////////////////////////

function formatObservation(obs,full){
    var s = '';
    if(obs.speed||obs.direction) { 
      if(obs.speed >= 0) {
        if(full) s += " wind ";
        if(obs.speed) s += round(obs.speed,0);
        if(full) s += " miles ";
        if(obs.direction) {
            s += " at ";
            s += round(obs.direction,0);
            if(full) s += " degrees";
        }
      }
      else {
        s = "";
      }        
      s += ". ";
    }
    if(obs.gust) {
      s += " gust: " + round(obs.gust,0) + ". ";
    }
    if(full)
    {
        if(obs.air) s+= " air " + round(obs.air,0) + ". ";
        if(obs.water) s+= " water " + round(obs.water,0) + ". ";
    }
    if(full||(obs.speed!=null||obs.direction!=null))
    {
        if(s=='') s = "no observations";
        s = obs.name + " : " + s;
    }
    return s;
}

//////////////////////////////////////////////////////////////////////////////////////

function promiseFetchFormattedObservations(agent) {
    return promiseFetchMeteo().then((obs)=>{
        console.log('promiseFetchFormattedObservations');
        var s = "";
        if(obs) {
            if(obs.bodega) s += formatObservation(obs.bodega);
            if(obs.boonnoaa) s += formatObservation(obs.boonnoaa);
            if(obs.tomales) s += formatObservation(obs.tomales);
            if(obs.bodegabuoy) s += formatObservation(obs.bodegabuoy);
            if(obs.porebuoy) s += formatObservation(obs.porebuoy);
            if(obs.porelt) s += formatObservation(obs.porelt);
            if(obs.chimney) s += formatObservation(obs.chimney);
        }
        else {
            s = "no observations!";
        }
        console.log('promiseFetchFormattedObservations end');
        return s;
    })
    .catch((err)=>{
        console.log("promiseFetchFormattedObservations error " + err);
        return "meteo error: ";
    });
}

//////////////////////////////////////////////////////////////////////////////////////

function subAbvs(txt) {
	const rep = [' ft', ' feet', ' kt', ' knots', ' nm ', ' Nautical Miles ', ' NM ', ' Nautical Miles ',
	'MON', 'Monday', 'TUE', 'Tuesday', 'WED', 'Wednesday', 'THU', 'Thursday', 'FRI', 'Friday', 'SAT', 'Saturday', 'SUN', 'Sunday',
	'Mon', 'Monday', 'Tue', 'Tuesday', 'Wed', 'Wednesday', 'Thu', 'Thursday', 'Fri', 'Friday', 'Sat', 'Saturday', 'Sun', 'Sunday',
	'NNE ', 'north-north-east ', 'SSE ', 'south-south-east ', 'SSW ', 'south-south-west ', 'NNW ', 'north-north-west ',
	'ENE ', 'east-north-east ', 'ESE ', 'east-south-east ', 'WSW ', 'west-south-west ', 'WNW ', 'west-north-west ',
	' NE ', ' north-east ', ' SE ', ' south-east ', ' SW ', ' south-west ', ' NW ', ' north-west ',
	' N ', ' north ', ' S ', ' south ', ' W ', ' west ', ' E ', ' east '
	];
	if( txt && typeof txt == 'string') {
    	for(var i = 0; i < rep.length; i+=2) {
    		txt = txt.replace(new RegExp(rep[i], 'g'),rep[i+1]);
    	}
	}
	return txt;
}

//////////////////////////////////////////////////////////////////////////////////////

function forecast2json(zone, txt){
    var fc = {};
    try
    {
        // some text then
        // PZZ540-020945-Coastal Waters from Point Arena to Point Reyes California out to 10 nm-216 PM PDT Sat Sep 1 2018
        // \npossibly... advisory...\n
        // forecast
        var ar = txt.split(zone.toUpperCase()); // split it at the ZONE
        var a = ar[1].replace(/\n\n/g,'_').replace(/\n/g,'\t').replace(/_/g,'\n');
        var hdr = a.match(/(?:-\d+)-\s*(?:.+)\s*-\s*(.+)/); // -dd d- .*-\n
        fc.name = subAbvs(hdr[1]);
        fc.date = hdr[2];
        a = a.substring(hdr.index+hdr[0].length);
        var adv = a.match(/^[.]{3}(?:.*)[.]{3}/); // ...anything...
        if(adv) {
            fc.advisory = adv[0];
            a = a.substring(adv.index+adv[0].length);
        }
        a = a.replace(/\n/g,'').replace(/\t[.]/g,'\n.').replace(/\t/g,' ');
        a = subAbvs(a);
        fc.forecasts = a.split('\n');
        //console.log(fc);
    }
    catch(ex) // st went wrong with parsing
    {
        console.log(ex);
        fc.name = zone;
        fc.date = new Date().toString();
        fc.forecasts = [txt, ex];
    }
    return fc;
}

// returns a promise to fetch noaa forecast by zone
function promiseToFetchNoaaForecast(zone)
{
    var url = 'http://tgftp.nws.noaa.gov/data/forecasts/marine/coastal/' + zone[0]+zone[1] +"/" + zone + ".txt";
    return rp(url).then((txt)=> { 
        console.log("forecast fetched for "+zone);
        return forecast2json(zone,txt);
    }).catch((err)=>{
      console.log("forcast error " + err + " url=" + url);
    });
}

//////////////////////////////////////////////////////////////////////////

function nws2json(html) {
	var $ = cheerio.load(html);
	var fc = {};
	var adv = $('span.warn').first();
	try{ fc.advisory = adv.text(); } catch(ex) {}
	var n = $("b:contains('NWS Forecast for')").first();
	try{ fc.name = subAbvs(n.text()); } catch(ex) {}
	var d = $("a:contains('Last Update')");
	fc.date = getNextTextElement(d);
	var tbl = $('table');
	try {
		var td = tbl.eq(1).find('td').eq(0); // choose second table's first td - hope the format did not change
		td = subAbvs(td.text());
		if(fc.advisory) td=td.substring(fc.advisory.length);// adv is in the table; remove if any
		var sa = td.split('\n\n');
		fc.forecasts = sa;
	} catch(e){ 
	    console.log(e); 
	}
	return fc;
}

function promiseToFetchNWSForecast(location) {
	var spec = typeof location == 'string' ? 
      "&zoneid="+location 
    : "&lat="+location.lat+"&lon="+location.lon;
	var url = 
    "https://forecast.weather.gov/MapClick.php?unit=0&lg=english&FcstType=text&TextType=1"+spec;
	//"https://marine.weather.gov/MapClick.php?unit=0&lg=english&FcstType=text&TextType=1&zoneid=pzz540"
	//"https://marine.weather.gov/MapClick.php?"+spec;
    console.log("fetching " +url);
	return fetch(url)
	.then((html)=>{
        console.log("fetched forecaset: " + html);
		return nws2json(html);
	})
  	.catch((err)=>{
      	console.log(err + ' ' + url);
    });
}


function formatForecast(fc, short) {
    console.log(fc);
    var s = '';
    if(fc && fc.forecasts) {
        if(!short)
        {
            s += fc.name + '.  ';
        }
        s += fc.advisory && fc.advisory !== '' ? fc.advisory + '.  ' : '';
        s += fc.forecasts[0] +' \n';
        s += fc.forecasts[1] +' \n';
    } else {
        s = 'empty forecast';
    }
    return s;
}

//////////////////////////////////////////////////////////////////////////////////////

function checkForWindFormatForecast(fc,onlyfirst2){
    var s = "";
    if(typeof fc.advisory === 'string' && fc.advisory !== '') {
        s += "There is " + fc.advisory + '. ';
    }
    var a = fc.forecasts;
    var n = onlyfirst2 ? 2 : a.length;
    for(var i = 0; i < n; i++) {
        var range = a[i].match(/(\d*)\s*to\s*(\d*)\s*knots/);
        if(range && range[2] > 15) {
            var when = a[i].match(/^([a-zA-Z ]*):/);
            if(when) s += when[1] + " ";
            s += 'up to ' + range[2] + ' knots. ';
        }
    }
    return s;
}

function checkForWind(fc) {
    if(!fc) {
        return 'empty forecast';
    }
    var s = '';
    try {
        s = checkForWindFormatForecast(fc);
        if(s!=='')  s = 'YES! '+s; else s = "Nope! Nothing in the next few days.";
    }
    catch (ex) {
        console.log('crashed checkForWinds ' + ex);
        console.log(fc);
        s = 'We failed!';
    }
    return s;
}

//////////////////////////////////////////////////////////////////////////

function promiseToFindTideStation(place)
{
    var url = "https://tidesandcurrents.noaa.gov/mdapi/latest/webapi/tidepredstations.json?q="+place;
    return testWrap(url,fetchJson(url));
}

function promiseToFetchTidePredictions(stationId)
{
    var url = 'https://tidesandcurrents.noaa.gov/api/datagetter?product=predictions';
    url += "&application=GoogleAssistant.MarineWeather";
    url += "&station="+stationId;
    url += "&date=today";
    url += '&datum=MLLW&time_zone=lst_ldt&units=english&interval=hilo&format=json';
    return testWrap(url,fetchJson(url));
}

function formatTideItem(item) {
    //{"t":"2018-07-07 01:05", "v":"1.719", "type":"L"}
    item.t.match(/(\d\d\d\d)-(\d\d)-(\d\d)\s*(\d\d):(\d\d)/);
    //return "At " + time24tostr12(RegExp.$4,RegExp.$5,30) + (item.type=="L" ? " Low, " : " High, ") + (Math.round(item.v*10)/10) + " feet. ";
    return (item.type=="L" ? " Low, " : " High, ") + (Math.round(item.v*10)/10) + " feet  at " + time24to12str(RegExp.$4,RegExp.$5) + ".  ";
}

function formatTides(station, preds) {
    var msg = "";  
    try {
    if(preds.predictions) 
        preds.predictions.forEach((p)=>{ msg += formatTideItem(p); });
    } catch(e)  {
      console.log("formatTides error: " + e);
    }  
    return msg;
}

//////////////////////////////////////////////////////////////////////////////////////

var noaaZones = {"PHZ123":"BIG ISLAND LEEWARD WATERS","PHZ113":"KAUAI CHANNEL","PHZ121":"ALENUIHAHA CHANNEL","PZZ132":"EAST ENTRANCE U.S. WATERS STRAIT OF JUAN DE FUCA","PMZ173":"POHNPEI","PZZ450":"PT ST GEORGE TO CAPE MENDOCINO OUT 10 NM","PZZ531":"SAN FRANCISCO BAY SOUTH OF THE BAY BRIDGE","PHZ115":"OAHU LEEWARD WATERS","PZZ130":"WEST ENTRANCE U.S. WATERS STRAIT OF JUAN DE FUCA","PZZ650":"EAST SANTA BARBARA CHANNEL FROM PT. CONCEPTION TO PT. MUGU CA INCLUDING SANTA CRUZ ISLAND","PZZ673":"WATERS FROM PT. SAL TO SANTA CRUZ ISLAND CA AND WESTWARD 60 NM INCLUDING SAN MIGUEL AND SANTA ROSA ISLANDS","PZZ275":"WATERS FROM CASCADE HEAD TO FLORENCE OR FROM 10 TO 60 NM","PZZ530":"SAN PABLO BAY SUISUN BAY THE WEST DELTA AND SAN FRANCISCO BAY NORTH OF THE BAY BRIDGE","PHZ112":"KAUAI LEEWARD WATERS","PHZ119":"MAALAEA BAY","PMZ161":"KOROR PALAU","PHZ117":"MAUI COUNTY WINDWARD WATERS","PZZ270":"WATERS FROM CAPE SHOALWATER WA TO CASCADE HEAD OR FROM 10 TO 60 NM","GMZ530":"LAKE PONTCHARTRAIN AND LAKE MAUREPAS","GMZ230":"BAYS AND WATERWAYS FROM BAFFIN BAY TO PORT ARANSAS","PZZ576":"POINT PINOS TO POINT PIEDRAS BLANCAS 10 TO 60 NM OFFSHORE","PZZ210":"COLUMBIA RIVER BAR","PHZ124":"BIG ISLAND SOUTHEAST WATERS","GMZ800":"SYNOPSIS FOR THE COASTAL WATERS FROM BONITA BEACH TO SUWANNEE RIVER","GMZ836":"CHARLOTTE HARBOR AND PINE ISLAND SOUND","GMZ100":"SYNOPSIS FOR BAFFIN BAY TO RIO GRANDE OUT 60 NM","PZZ475":"CAPE MENDOCINO TO PT ARENA 10 TO 60 NM","PMZ181":"MAJURO","GMZ250":"COASTAL WATERS FROM BAFFIN BAY TO PORT ARANSAS OUT 20 NM","PMZ151":"GUAM COASTAL WATERS","GMZ532":"MISSISSIPPI SOUND","PZZ535":"MONTEREY BAY","PZZ571":"POINT REYES TO PIGEON POINT 10 TO 60 NM OFFSHORE","GMZ430":"SABINE LAKE","PZZ133":"NORTHERN INLAND WATERS INCLUDING THE SAN JUAN ISLANDS","GMZ606":"SYNOPSIS FOR JUPITER INLET TO OCEAN REEF FL OUT TO 60 NM AND FOR EAST CAPE SABLE TO BONITA BEACH FL OUT TO 60 NM","PZZ670":"POINT PIEDRAS BLANCAS TO POINT SAL FROM 10 TO 60 NM","GMZ031":"FLORIDA BAY INCLUDING BARNES SOUND, BLACKWATER SOUND, AND BUTTONWOOD SOUND","PZZ356":"COASTAL WATERS FROM CAPE BLANCO OR TO PT. ST. GEORGE CA OUT 10 NM","GMZ235":"BAYS AND WATERWAYS FROM PORT ARANSAS TO PORT O'CONNOR","GMZ501":"SYNOPSIS PASCAGOULA TO SW PASS MISSISSIPPI","GMZ435":"VERMILION BAY","PZZ110":"GRAYS HARBOR BAR","GMZ470":"WATERS FROM CAMERON LA TO HIGH ISLAND TX FROM 20 TO 60 NM","PZZ676":"OUTER WATERS FROM SANTA CRUZ ISLAND TO SAN CLEMENTE ISLAND TO 60 NM OFFSHORE INCLUDING SAN NICOLAS AND SANTA BARBARA ISLANDS","GMZ350":"COASTAL WATERS FROM FREEPORT TO MATAGORDA SHIP CHANNEL TX OUT 20 NM","GMZ370":"WATERS FROM FREEPORT TO MATAGORDA SHIP CHANNEL TX FROM 20 TO 60 NM","PZZ470":"PT ST GEORGE TO CAPE MENDOCINO 10 TO 60 NM","PZZ250":"COASTAL WATERS FROM CAPE SHOALWATER WA TO CASCADE HEAD OR OUT 10 NM","PZZ134":"ADMIRALTY INLET","PHZ111":"KAUAI WINDWARD WATERS","GMZ634":"PENSACOLA BAY SYSTEM","GMZ870":"WATERS FROM TARPON SPRINGS TO SUWANNEE RIVER FL OUT 20 TO 60 NM","GMZ455":"COASTAL WATERS FROM LOWER ATCHAFALAYA RIVER TO INTRACOASTAL CITY LA OUT 20 NM","GMZ452":"COASTAL WATERS FROM INTRACOASTAL CITY TO CAMERON LA OUT 20 NM","PMZ174":"KOSRAE","PHZ120":"PAILOLO CHANNEL","PMZ172":"CHUUK","GMZ856":"COASTAL WATERS FROM BONITA BEACH TO ENGLEWOOD FL OUT 20 NM","GMZ432":"CALCASIEU LAKE","PZZ455":"CAPE MENDOCINO TO PT ARENA OUT 10 NM","GMZ633":"PERDIDO BAY","PZZ370":"WATERS FROM FLORENCE TO CAPE BLANCO OR FROM 10 TO 60 NM","PZZ750":"COASTAL WATERS FROM SAN MATEO POINT TO THE MEXICAN BORDER AND OUT TO 30 NM","GMZ873":"WATERS FROM ENGLEWOOD TO TARPON SPRINGS FL OUT 20 TO 60 NM","GMZ475":"WATERS FROM LOWER ATCHAFALAYA RIVER TO INTRACOASTAL CITY LA FROM 20 TO 60 NM","GMZ830":"TAMPA BAY WATERS","GMZ534":"LAKE BORGNE","PHZ114":"OAHU WINDWARD WATERS","PHZ122":"BIG ISLAND WINDWARD WATERS","PZZ645":"POINT PIEDRAS BLANCAS TO POINT SAL WESTWARD OUT TO 10 NM","GMZ700":"SYNOPSIS FOR THE SUWANNEE RIVER TO OKALOOSA","PZZ545":"POINT REYES TO PIGEON POINT TO 10 NM","GMZ600":"SYNOPSIS FOR PASCAGOULA MS TO OKALOOSA WALTON COUNTY LINE FL OUT 60 NM INCLUDING MAJOR AREA BAYS AND SOUNDS","GMZ676":"WATERS FROM CHOKOLOSKEE TO BONITA BEACH FL FROM 20 TO 60 NM","GMZ853":"COASTAL WATERS FROM ENGLEWOOD TO TARPON SPRINGS FL OUT 20 NM","PZZ135":"PUGET SOUND AND HOOD CANAL","PZZ655":"INNER WATERS FROM POINT MUGU TO SAN MATEO PT. CA INCLUDING SANTA CATALINA AND ANACAPA ISLANDS","GMZ472":"WATERS FROM  INTRACOASTAL CITY TO CAMERON LA FROM 20 TO 60 NM","PZZ560":"PIGEON POINT TO POINT PINOS TO 10 NM","PZZ131":"CENTRAL U.S. WATERS STRAIT OF JUAN DE FUCA","PMZ171":"YAP","PZZ775":"WATERS FROM SAN MATEO POINT TO THE MEXICAN BORDER EXTENDING 30 TO 60 NM OUT INCLUDING SAN CLEMENTE ISLAND","PHZ116":"KAIWI CHANNEL","GMZ850":"COASTAL WATERS FROM TARPON SPRINGS TO SUWANNEE RIVER FL OUT 20 NM","GMZ355":"COASTAL WATERS FROM HIGH ISLAND TO FREEPORT TX OUT 20 NM","PZZ575":"PIGEON POINT TO POINT PINOS 10 TO 60 NM OFFSHORE","GMZ876":"WATERS FROM BONITA BEACH TO ENGLEWOOD FL OUT 20 TO 60 NM","ANZ200":"116 AM EDT SUN JUL 22 2018  .SYNOPSIS FOR MASSACHUSETTS AND RHODE ISLAND COASTAL WATERS... LOW PRES OFF THE MID","ANZ051":"COASTAL WATERS FROM SCHOODIC POINT, ME TO STONINGTON, ME OUT 25 NM","ANZ233":"VINEYARD SOUND","ANZ050":"COASTAL WATERS FROM EASTPORT, ME TO SCHOODIC POINT, ME OUT 25 NM","ANZ335":"LONG ISLAND SOUND WEST OF NEW HAVEN CT/PORT JEFFERSON NY","ANZ338":"NEW YORK HARBOR","ANZ251":"MASSACHUSETTS BAY AND IPSWICH BAY","ANZ152":"COASTAL WATERS FROM PORT CLYDE, ME TO CAPE ELIZABETH, ME OUT 25 NM","ANZ232":"NANTUCKET SOUND","ANZ052":"INTRA COASTAL WATERS FROM SCHOODIC POINT, ME TO STONINGTON, ME","ANZ154":"COASTAL WATERS FROM CAPE ELIZABETH, ME TO MERRIMACK RIVER, MA OUT 25 NM","ANZ230":"BOSTON HARBOR","ANZ150":"COASTAL WATERS FROM STONINGTON, ME TO PORT CLYDE, ME OUT 25 NM","ANZ330":"LONG ISLAND SOUND EAST OF NEW HAVEN CT/PORT JEFFERSON NY","ANZ234":"BUZZARDS BAY","ANZ255":"COASTAL WATERS EXTENDING OUT TO 25 NM SOUTH OF MARTHAS VINEYARD AND NANTUCKET","ANZ256":"COASTAL WATERS FROM MONTAUK NY TO MARTHAS VINEYARD EXTENDING OUT TO 20 NM SOUTH OF BLOCK ISLAND","ANZ254":"COASTAL WATERS FROM PROVINCETOWN MA TO CHATHAM MA TO NANTUCKET MA OUT 20 NM","ANZ151":"PENOBSCOT BAY","ANZ237":"BLOCK ISLAND SOUND","ANZ231":"CAPE COD BAY","ANZ235":"RHODE ISLAND SOUND","ANZ430":"DELAWARE BAY WATERS NORTH OF EAST POINT NJ TO SLAUGHTER BEACH DE","ANZ353":"FIRE ISLAND INLET NY TO MORICHES INLET NY OUT 20 NM","ANZ250":"COASTAL WATERS EAST OF IPSWICH BAY AND THE STELLWAGEN BANK NATIONAL MARINE SANCTUARY","ANZ350":"MORICHES INLET NY TO MONTAUK POINT NY OUT 20 NM","ANZ355":"SANDY HOOK NJ TO FIRE ISLAND INLET NY OUT 20 NM","ANZ530":"CHESAPEAKE BAY NORTH OF POOLES ISLAND","ANZ634":"CHESAPEAKE BAY FROM LITTLE CREEK VA TO CAPE HENRY VA INCLUDING THE CHESAPEAKE BAY BRIDGE TUNNEL","ANZ538":"PATAPSCO RIVER INCLUDING BALTIMORE HARBOR","ANZ542":"PATUXENT RIVER TO BROOMES ISLAND MD","ANZ532":"CHESAPEAKE BAY FROM SANDY POINT TO NORTH BEACH","ANZ638":"JAMES RIVER FROM JAMES RIVER BRIDGE TO HAMPTON ROADS BRIDGE","ANZ635":"RAPPAHANNOCK RIVER FROM URBANNA TO WINDMILL POINT","ANZ153":"CASCO BAY","ANZ531":"CHESAPEAKE BAY FROM POOLES ISLAND TO SANDY POINT","ANZ650":"COASTAL WATERS FROM FENWICK ISLAND DE TO CHINCOTEAGUE VA OUT 20 NM","ANZ637":"JAMES RIVER FROM JAMESTOWN TO THE JAMES RIVER BRIDGE","ANZ431":"DELAWARE BAY WATERS SOUTH OF EAST POINT NJ TO SLAUGHTER BEACH DE","ANZ534":"CHESAPEAKE BAY FROM DRUM POINT TO SMITH POINT","ANZ340":"PECONIC AND GARDINERS BAYS","ANZ236":"NARRAGANSETT BAY","ANZ636":"YORK RIVER","ANZ535":"TIDAL POTOMAC FROM KEY BRIDGE TO INDIAN HEAD","ANZ540":"EASTERN BAY","ANZ630":"CHESAPEAKE BAY FROM SMITH POINT TO WINDMILL POINT VA","ANZ345":"SOUTH SHORE BAYS FROM JONES INLET THROUGH SHINNECOCK BAY","ANZ539":"CHESTER RIVER TO QUEENSTOWN MD","ANZ631":"CHESAPEAKE BAY FROM WINDMILL POINT TO NEW POINT COMFORT VA","ANZ652":"COASTAL WATERS FROM CHINCOTEAGUE TO PARRAMORE ISLAND VA OUT 20 NM","ANZ537":"TIDAL POTOMAC FROM COBB ISLAND TO SMITH POINT","AMZ156":"S OF OCRACOKE INLET TO CAPE LOOKOUT NC OUT 20 NM","ANZ633":"CURRITUCK SOUND","AMZ136":"PAMLICO AND PUNGO RIVERS","AMZ158":"S OF CAPE LOOKOUT TO N OF SURF CITY NC OUT 20 NM","ANZ656":"COASTAL WATERS FROM CAPE CHARLES LIGHT TO VIRGINIA","AMZ135":"PAMLICO SOUND","ANZ536":"TIDAL POTOMAC FROM INDIAN HEAD TO COBB ISLAND","ANZ658":"COASTAL WATERS FROM NC VA BORDER TO CURRITUCK BEACH LIGHT NC OUT 20 NM","AMZ131":"ALLIGATOR RIVER","AMZ137":"NEUSE AND BAY RIVERS","ANZ543":"TANGIER SOUND AND THE INLAND WATERS SURROUNDING BLOODSWORTH ISLAND","AMZ150":"S OF CURRITUCK BEACH LIGHT TO OREGON INLET NC OUT 20 NM","ANZ541":"CHOPTANK RIVER TO CAMBRIDGE MD AND THE LITTLE CHOPTANK RIVER","AMZ154":"S OF CAPE HATTERAS TO OCRACOKE INLET NC OUT 20 NM INCLUDING THE MONITOR NATIONAL MARINE SANCTUARY","ANZ654":"COASTAL WATERS FROM PARRAMORE ISLAND TO CAPE CHARLES LIGHT VA OUT 20 NM","ANZ632":"CHESAPEAKE BAY FROM NEW POINT COMFORT TO LITTLE CREEK VA","ANZ533":"CHESAPEAKE BAY FROM NORTH BEACH TO DRUM POINT","AMZ130":"ALBEMARLE SOUND","AMZ252":"COASTAL WATERS FROM CAPE FEAR NC TO LITTLE RIVER INLET SC OUT 20 NM","AMZ350":"WATERS FROM SOUTH SANTEE RIVER TO EDISTO BEACH SC OUT 20 NM","AMZ256":"COASTAL WATERS FROM MURRELLS INLET TO SOUTH SANTEE RIVER SC OUT 20 NM","AMZ250":"COASTAL WATERS FROM SURF CITY TO CAPE FEAR NC OUT 20 NM","AMZ152":"S OF OREGON INLET TO CAPE HATTERAS NC OUT 20 NM","AMZ254":"COASTAL WATERS FROM LITTLE RIVER INLET TO MURRELLS INLET SC OUT 20 NM","AMZ330":"CHARLESTON HARBOR","AMZ400":"SYNOPSIS FOR ALTAMAHA SOUND GA TO FLAGLER BEACH FL OUT TO 60 NM","AMZ715":"COASTAL WATERS OF NORTHERN USVI AND CULEBRA OUT 10 NM","AMZ712":"COASTAL WATERS OF NORTHERN PUERTO RICO OUT 10 NM","AMZ710":"ATLANTIC WATERS OF PUERTO RICO AND USVI FROM 10 NM TO 19.5N","AMZ722":"ANEGADA PASSAGE SOUTHWARD TO 17N","PKZ032":"NORTHERN CHATHAM STRAIT","PKZ021":"ICY STRAIT","PKZ022":"CROSS SOUND","AMZ745":"COASTAL WATERS OF SOUTHWESTERN PUERTO RICO OUT 10 NM","AMZ742":"COASTAL WATERS OF NORTHWESTERN PUERTO RICO OUT 10 NM","PKZ011":"GLACIER BAY","AMZ735":"COASTAL WATERS OF SOUTHERN PUERTO RICO OUT 10 NM","PKZ013":"SOUTHERN LYNN CANAL","PKZ034":"FREDERICK SOUND","AMZ741":"MONA PASSAGE SOUTHWARD TO 17N","PKZ031":"STEPHENS PASSAGE","PKZ035":"SUMNER STRAIT","PKZ036":"CLARENCE STRAIT","PKZ041":"DIXON ENTRANCE TO CAPE DECISION","PKZ052":"ICY CAPE TO CAPE SUCKLING","PKZ042":"CAPE DECISION TO CAPE EDGECUMBE","PKZ033":"SOUTHERN CHATHAM STRAIT","PKZ051":"CAPE FAIRWEATHER TO ICY CAPE","PKZ125":"PRINCE WILLIAM SOUND","PKZ136":"CHINIAK BAY","PKZ137":"MARMOT BAY","PKZ126":"PORT VALDEZ","PKZ121":"RESURRECTION BAY","PKZ053":"YAKUTAT BAY","PKZ127":"VALDEZ NARROWS","AMZ732":"CARIBBEAN WATERS OF PUERTO RICO FROM 10 NM TO 17N","PKZ099":"327 PM AKDT SAT JUL 21 2018 .SYNOPSIS FOR OUTSIDE WATERS... A RIDGE OF HIGH PRESSURE WILL REMAIN IN PLACE OVER THE EASTERN GULF THROUGH MID","PKZ130":"WEST OF BARREN ISLANDS INCLUDING KAMISHAK BAY","PKZ120":"CAPE CLEARE TO GORE POINT","PKZ129":"PASSAGE CANAL","PKZ138":"SHELIKOF STRAIT","PKZ132":"MARMOT ISLAND TO SITKINAK","PKZ043":"CAPE EDGECUMBE TO CAPE FAIRWEATHER","PKZ119":"CAPE SUCKLING TO CAPE CLEARE","PKZ131":"BARREN ISLANDS EAST","PKZ128":"VALDEZ ARM","PKZ012":"NORTHERN LYNN CANAL","PKZ098":"327 PM AKDT SAT JUL 21 2018 .SYNOPSIS FOR SOUTHEAST ALASKA INNER CHANNELS COASTAL WATERS... A RIDGE OF HIGH PRESSURE WILL REMAIN IN PLACE OVER THE EASTERN GULF THROUGH MID","PKZ139":"COOK INLET KALGIN ISLAND TO POINT BEDE","PKZ160":"BRISTOL BAY","PKZ150":"SOUTH OF THE AK PENINSULA SITKINAK TO CASTLE CAPE","PKZ140":"COOK INLET NORTH OF KALGIN ISLAND","PKZ155":"SOUTH OF THE AK PENINSULA CASTLE CAPE TO CAPE SARICHEF","PKZ141":"KACHEMAK BAY","PKZ170":"CAPE SARICHEF TO NIKOLSKI BERING SIDE","PKZ165":"PORT HEIDEN TO CAPE SARICHEF","PKZ171":"UNALASKA BAY","PKZ172":"CAPE SARICHEF TO NIKOLSKI PACIFIC SIDE","PKZ180":"KUSKOKWIM DELTA AND ETOLIN STRAIT","PKZ179":"PRIBILOF ISLANDS NEAR SHORE WATERS","PKZ177":"ADAK TO KISKA","PKZ178":"KISKA TO ATTU","PKZ176":"SEGUAM ISLAND TO ADAK PACIFIC SIDE","PKZ174":"NIKOLSKI TO SEGUAM ISLAND PACIFIC SIDE","PKZ220":"WALES TO CAPE THOMPSON","PKZ245":"FLAXMAN ISLAND TO DEMARCATION POINT","PKZ175":"SEGUAM ISLAND TO ADAK BERING SIDE","PKZ210":"DALL POINT TO WALES","PKZ235":"POINT FRANKLIN TO CAPE HALKETT","PKZ185":"SAINT MATTHEW ISLAND WATERS","PKZ181":"NORTH AND WEST OF NUNIVAK ISLAND","PKZ173":"NIKOLSKI TO SEGUAM ISLAND BERING SIDE","PKZ200":"NORTON SOUND","PKZ225":"CAPE THOMPSON TO CAPE BEAUFORT","PKZ215":"KOTZEBUE SOUND","PKZ240":"CAPE HALKETT TO FLAXMAN ISLAND","GMZ330":"MATAGORDA BAY","PZZ570":"POINT ARENA TO POINT REYES 10 TO 60 NM OFFSHORE","GMZ375":"WATERS FROM HIGH ISLAND TO FREEPORT TX FROM 20 TO 60 NM","GMZ450":"COASTAL WATERS FROM CAMERON LA TO HIGH ISLAND TX OUT 20 NM","GMZ255":"COASTAL WATERS FROM PORT ARANSAS TO MATAGORDA SHIP CHANNEL OUT 20 NM","PKZ230":"CAPE BEAUFORT TO POINT FRANKLIN","PHZ110":"KAUAI NORTHWEST WATERS","PZZ255":"COASTAL WATERS FROM CASCADE HEAD TO FLORENCE OR OUT 10 NM","PHZ118":"MAUI COUNTY LEEWARD WATERS","PZZ540":"POINT ARENA TO POINT REYES TO 10 NM","PZZ565":"POINT PINOS TO POINT PIEDRAS BLANCAS TO 10 NM","PZZ350":"COASTAL WATERS FROM FLORENCE TO CAPE BLANCO OR OUT 10 NM","GMZ630":"NORTHERN MOBILE BAY","GMZ335":"GALVESTON BAY","PZZ376":"WATERS FROM CAPE BLANCO OR TO PT. ST. GEORGE CA FROM 10 TO 60 NM","AMZ572":"VOLUSIA","AMZ570":"FLAGLER BEACH TO VOLUSIA","AMZ630":"BISCAYNE BAY","AMZ550":"FLAGLER BEACH TO VOLUSIA","AMZ575":"SEBASTIAN INLET TO JUPITER INLET 20","AMZ552":"VOLUSIA","AMZ555":"SEBASTIAN INLET TO JUPITER INLET 0","AMZ610":"LAKE OKEECHOBEE","AMZ500":"SYNOPSIS FOR FLAGLER BEACH TO JUPITER INLET OUT TO 60 NM","AMZ352":"WATERS FROM EDISTO BEACH SC TO SAVANNAH GA OUT 20 NM","AMZ354":"WATERS FROM SAVANNAH GA TO ALTAMAHA SOUND GA OUT 20 NM, INCLUDING GRAYS REEF NATIONAL MARINE SANCTUARY","AMZ374":"WATERS FROM SAVANNAH GA TO ALTAMAHA SOUND GA EXTENDING FROM 20 TO 60 NM","AMZ725":"COASTAL WATERS OF SOUTHERN USVI VIEQUES AND EASTERN PUERTO RICO OUT 10 NM"};
var noaaBuoys = {"41002":"SOUTH HATTERAS","41003":"EDISTO","41005":"GRAYS REEF","41009":"CANAVERAL 20 NM EAST OF CAPE CANAVERAL, FL","41010":"CANAVERAL EAST","41011":"ST. AUGUSTINE, FL 40NM ENE OF ST AUGUSTINE, FL","41015":"OLYMPIC NORTHEAST","41022":"OLYMPIC SOUTHWEST","41023":"OLYMPIC SOUTHWEST","41025":"DIAMOND SHOALS, NC","42002":"WEST GULF","42003":"EAST GULF","42004":"BILOXI","42008":"ORANGE BEACH","42015":"FREEPORT, TX","42020":"CORPUS CHRISTI, TX","42025":"GALVESTON,TX","42036":"WEST TAMPA","42037":"PENSACOLA","42040":"LUKE OFFSHORE TEST PLATFORM","42041":"NORTH MID GULF 110NM SOUTH OF GRAND ISLE, LA","42042":"PASCAGOULA","42054":"EAST GULF","44001":"HOTEL 200NM EAST OF CAPE MAY,NJ","44005":"GULF OF MAINE","44006":"PORTLAND","44008":"NANTUCKET 54NM SOUTHEAST OF NANTUCKET","44009":"DELAWARE BAY 26 NM SOUTHEAST OF CAPE MAY, NJ","44010":"GEORGES BANK 170 NM EAST OF HYANNIS, MA","44012":"BOSTON 16 NM EAST OF BOSTON, MA","44014":"VIRGINIA BEACH 64 NM EAST OF VIRGINIA BEACH, VA","44015":"MONTAUK POINT","44018":"CAPE COD","44019":"LONG ISLAND","44026":"BUZZARD'S BAY","45001":"MID SUPERIOR","45002":"NORTH MICHIGAN","45003":"NORTH HURON","45004":"EAST SUPERIOR","45005":"WEST ERIE","45006":"WEST SUPERIOR","45007":"SOUTH MICHIGAN","45008":"SOUTH HURON","45009":"EAST LAKE ONTARIO","46002":"WEST OREGON","46003":"S ALEUTIANS","46004":"MIDDLE NOMAD","46005":"WEST WASHINGTON","46006":"SOUTHEAST PAPA","46007":"SANTA MARIA","46012":"HALF MOON BAY","46013":"BODEGA BAY","46014":"PT ARENA","46015":"PORT ORFORD","46016":"EEL RIVER","46023":"PT ARGUELLO","46024":"SANTA MONICA BASIN","46026":"SAN FRANCISCO","46027":"ST GEORGES","46028":"CAPE SAN MARTIN","46029":"COLUMBIA RIVER BAR","46030":"BLUNTS REEF","46031":"CENTRAL BERING SEA","46036":"SOUTH NOMAD","46037":"CAPE ELIZABETH","46042":"MONTEREY","46043":"REDONDO BEACH","46047":"TANNER BANK","46048":"STONEWALL BANK","46051":"HARVEST EXPERIMENT PLATFORM","46053":"EAST SANTA BARBARA","46054":"WEST SANTA BARBARA  38 NM WEST OF SANTA BARBARA, CA","46059":"WEST CALIFORNIA","46060":"WEST ORCA BAY","46061":"SEAL ROCKS","46062":"PT. SAN LUIS, CA","46063":"PT.CONCEPTION, CA","46066":"SOUTH KODIAK","46072":"CENTRAL ALEUTIANS 230NM SW DUTCH HARBOR","46079":"BARREN ISLAND","46080":"PORTLOCK BANK","46082":"CAPE SUCKLING","46083":"FAIRWEATHER GROUND 105NM WEST  OF JUNEAU, AK","46084":"CAPE EDGECUMBE","51001":"NORTHWESTERN HAWAII ONE","51002":"SOUTHWEST HAWAII","51003":"WESTERN  HAWAII","51004":"SOUTHEAST HAWAII","51005":"NORTHERN MOLOKAI","51027":"CHRISTMAS ISLAND","52009":"MARINE AUTOMATED NETWORK (C","91204":"ULITHI IS., CAROLINE","91222":"PAGAN IS.,MARIANA","91251":"ENEWETAK, MARSHALL","91328":"ULUL ATOLL, CAROLINE","91338":"SATAWAN ATOLL, CARO.","91343":"OROLUK, CAROLINE","91352":"PINGELAP, CAROLINE","91356":"KOSRAE, CAROLINE","91365":"UJAE ATOLL, MARSHALL","91374":"MALOELAP, MARSHALL","91377":"MILI, MARSHALLS IS.","91411":"NGULU ATOLL, CAROLINE","91442":"EBON ATOLL, CAROLINE","EB01":"EAST HATTERAS","EB10":"MID GULF","EB33":"WESTERN GULF OF ALASKA","ABAN6":"ALEXANDRIA BAY, NY","ALRF1":"ALLIGATOR REEF","ALSN6":"AMBROSE LIGHT, NY","AUGA2":"AUGUSTINE ISLAND, AK","BLIA2":"BLIGH REEF LIGHT, AK","BURL1":"SOUTHWEST PASS, LA","BUSL1":"BULLWINKLE BLOCK 65","BUZM3":"BUZZARDS BAY, MA","CARO3":"CAPE ARAGO, OR","CDRF1":"CEDAR KEY, FL","CHLV2":"CHESAPEAKE LIGHT, VA","CLKN7":"CAPE LOOKOUT, NC","CSBF1":"CAPE SAN BLAS, FL","DBLN6":"DUNKIRK, NY","DESW1":"DESTRUCTION ISLAND, WA","DISW3":"DEVILS ISLAND, WI","DPIA1":"DAUPHIN ISLAND, AL","DRFA2":"DRIFT RIVER TERMINAL, AK","DRYF1":"DRY TORTUGAS, FL","DSLN7":"DIAMOND SHLS LT., NC","DUCN7":"DUCK PIER, NC","FBIS1":"FOLLY ISLAND, SC","FFIA2":"FIVE FINGERS, AK","FPSN7":"FRYING PAN SHOALS, NC","FWYF1":"FOWEY ROCK, FL","GBCL1":"GARDEN BANKS","GDIL1":"GRAND ISLE, LA","GLLN6":"GALLOO ISLAND, NY","IOSN3":"ISLE OF SHOALS, NH","KTNF1":"KEATON BEACH, FL","LKWF1":"8722670","LNEL1":"LENA","LONF1":"LONG KEY, FL","LSCM4":"LAKE ST. CLAIR LIGHT, MI","MDRM1":"MT. DESERT ROCK, ME","MISM1":"MATINICUS ROCK, ME","MLRF1":"MOLASSES REEF, FL","MPCL1":"MAIN PASS","MRKA2":"MIDDLE ROCK LIGHT, AK","NWPO3":"NEWPORT, OR","PILA2":"PILOT ROCK, AK","PILM4":"PASSAGE ISLAND, MI","POTA2":"POTATO POINT, AK","PTAC1":"POINT ARENA, CA","PTAT2":"PORT ARANSAS, TX","PTGC1":"POINT ARGUELLO, CA","ROAM4":"ROCK OF AGES, MI","SANF1":"SAND KEY, FL","SAUF1":"ST. AUGUSTINE, FL","SBIO1":"SOUTH BASS ISLAND, OH","SGNW3":"SHEBOYGAN, WI","SISW1":"SMITH ISLAND, WA","SJLF1":"ST. JOHN'S LIGHT","SMKF1":"SOMBRERO KEY, FL","SPGF1":"SETTLEMENT POINT, GBI, BAHAMAS","SRST2":"SABINE PASS, TX","STDM4":"STANNARD ROCK, MI","SUPN6":"SUPERIOR SHOALS, NY","SVLS1":"SAVANNAH LIGHT, GA","THIN6":"THOUSAND I. BRDG., NY","TPLM2":"THOMAS POINT, MD","TTIW1":"TATOOSH ISLAND, WA","VENF1":"VENICE, FL","WPOW1":"WEST POINT, WA","FARP2":"FARAULEP, CAROLINES ISLAND"};

function matchquality(name,str) {
	var words = str.split(' ');
	var count = - words.length;
	for(var i = 0; i < words.length; i++)
		if(name.includes(words[i])) ++count;
}

function findIdByName(map, str) {
	str = str.toUpperCase();
	if(map[str])
		return str;
	var ret = [];
	var curMatchQual = -100;
	var curMatchId = '';
	for(var id in map) {
		var name = map[id];
		if(name === str) return id;
		if(name.includes(str)) return id;
		var qual = matchquality(name, str);
		if(curMatchQual > qual) {
			curMatchQual = qual;
			curMatchId = id;
		}
	}
	return curMatchId;
}

//////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////

// replies to requests from dialogflow webfulfilment
function requestHandler(request, response) {

  console.log('DialogFlow RQ from ' + request.headers.host);
  console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
  console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

  const agent = new WebhookClient({ request, response });

  function oneOf(arr) {
    let n = Math.round((arr.length-1)*Math.random());
    return arr[n];
  }
 
  function welcome(agent) {
    agent.add(oneOf([
        `Hi! It may be windy or not, do you want to know?`,
        `Carefull! water is very wet today!`, 
        "Yo! Do you want to go sailing?",
        "Is it a great day to go sailing?",
        "Ahoy Mate!",
        "It may be a great day to go sailing!"]));
  }
     
  function fallback(agent) {
    agent.add(oneOf([`I didn't understand.`,`Say what?`,`Sorry, come again?','What was that?`]));
  }
  
  function doForecast(agent,name){
    name = name.toLowerCase();
    var zone = '';
    if(name=='bodega'||name=='bodega bay'||name=='bodega harbor'||name=='tomales'||name=='dillon'||name=='dillon beach')
        zone='pzz540';
    else {
        zone = findIdByName(noaaZones, name);
        console.log("findZoneCodeByName " + name + " => " + zone);
    }
    if(zone!=='')
    {
        var p = promiseToFetchNWSForecast(zone)
            .then((fc) => {
                agent.add(formatForecast(fc));
            })
            .catch((err)=> { 
                agent.add("Forecast fetch error:" + err); 
            });
        return p;
    } 
    else
        agent.add('I do not know yet how to find forecast locations such as '+name);
  }
  
  function observations(agent){
    var par = agent.parameters.id;
    if(!par)
        return promiseFetchFormattedObservations().then((txt)=>{
            agent.add(txt);
        })
        .catch((err)=> { 
            agent.add("Sorry, crashed.");
            console.log('observations:' + err); 
        });
    else
        return noaabuoy(agent);
  }
 
  function summery(agent) {
    var ftxt, otxt, ttxt;
    var p = [ 
        promiseFetchFormattedObservations()
        .then((txt)=>{ otxt = txt; })
        .catch((err)=>{ otxt = "No meteo information."; console.log("summery/meteo: " + err); }),
        promiseToFetchNWSForecast('pzz540')
        .then((fc) => { ftxt = checkForWindFormatForecast(fc,true); })
        .catch((err)=>{ ftxt = "No forcast information."; console.log("summery/forecast: " + err); }),
        promiseToFetchTidePredictions('9415469')
        .then((t)=>{
            console.log("fetched tides for summery: " + t );
            ttxt = "Tide " + formatTides({name:"Tomales Bay Entrance", stationid:'9415469'},t); 
        })
        .catch((err)=>{ ttxt = " No tides information."; console.log("summery/tides: "+err); })
    ];
    return Promise.all(p).then(()=>{ agent.add(otxt + "\n" + ftxt + "\n" + ttxt); });
  }
  
  function doTides(agent,location) {
    console.log("doTides location="+location);
    if(location==='tomales') location='tomales point';
    if(location==='bodega') location='bodega harbor';
    var promise = promiseToFindTideStation(location)
    .then( (reply) => {
        console.log("doTides got station list ");
        var list = reply.stationList;
        if(!list) 
            agent.add("No matching stations found, try again."); 
        else if(list.length>1) {
            var s = ""; const MX = 5;
            for(var i = 0; i < MX && i < list.length; i++)
            {
                s += list[i].name.split(',')[0] + ",";
            }
            agent.add("Many stations found: "+s+(list.length>MX?' and more.':'.'));
        }
        else if(list.length==1) {
            var station = list[0];
            return promiseToFetchTidePredictions(station.stationId)
            .then((tides)=>{  
                var msg = "Tides for ";
                try {msg += station.name.split(',')[0];} catch(e){ msg+= station.name; }
                msg += ".  "
                agent.add(msg + formatTides(station,tides)); 
            })
            .catch((err)=>{ 
                console.log("doTides.catch " + err); 
                agent.add("No predictions for " + station.name); 
            });
        }
    })
    .catch( (err) => { 
        console.log("doTides promise.catch " + err);
        agent.add("I could not contact 'tides and currents'. Error " + err);
    });
    return promise;
  }
  
  function tidesfor(agent) {
        let location = agent.parameters.location;
        return doTides(agent,location);
  }
  
    function tides(agent) {
      try{
        const locationctx = agent.getContext('location');
        let location =  locationctx.parameters.location;
        return doTides(agent,location);
      }
      catch(e)
      {
      }
	  agent.add("I seem to have lost current location. Please ask for it again.");
    }
  
    function forecastfor(agent) {
        var location = agent.parameters.location;
        return doForecast(agent,location);
    }

    function forecast(agent) {
        const locationctx = agent.getContext('location');
        let location = 'bodega';
        if(locationctx) {
            let location =  locationctx.parameters.location;
        }
        return doForecast(agent,location);
    }
    
    function zoneforecastfor(agent) {
        const zone = agent.parameters.zone;
        return promiseToFetchNWSForecast(zone)
        .then((fc)=>{
            agent.add(formatForecast(fc));
            console.log('NWS zone fc for ' + zone);
        })
        .catch((err)=>{
            agent.add("I could not get zone forecast from NWS for "+zone); 
            console.log(err);
        });
    }
  
    function locate(agent) {
        let location = agent.parameters.location;
        return promiseToFetchGeocode(location)
        .then((resp)=>{
            if(!resp||!resp.candidates||resp.candidates.length===0) {
               agent.add("Could not find "+location);
               return;
            } 
            var s = '';
            if(resp.candidates.length>1) {
                s += "Found "   + resp.candidates.length + " candidates. \n";
           }
           for(var i = 0; i < resp.candidates.length && i < 3; i++) {
               var cand = resp.candidates[i];
               s += cand.address + " - ";
               s += " longitute: " + round(cand.location.x,3);
               s += " latitute: " + round(cand.location.y,3);
               s += ".\n";
           }
           agent.add(s);
        })
        .catch((err)=>{
            agent.add("geocode access failed "+err);
        });
    }

    function willitbewindy(agent) {
        var par = agent.parameters.location;
        var zone =  par ? par : 'pzz540';
        return promiseToFetchNWSForecast(zone)
        .then((fc)=>{
            var msg = checkForWind(fc);
            agent.add(msg);
            console.log('will it be windy ' + msg);
        })
        .catch((err)=>{
            agent.add("failed getting zone forecast from NWS for "+zone); 
            console.log(err);
        });
    }
    
    function noaabuoy(agent) {
        var par = agent.parameters.id;
        var id = par ? par : '46013';
        id = findIdByName(noaaBuoys, id);
        return promiseToFetchNoaaBuoy(id)
        .then((buoy)=>{
            agent.add(formatObservation(buoy,true));
            console.log(buoy);
        })
        .catch((err)=>{
            agent.add("failed getting buoy data from NOAA for "+id);
            console.log(err);
        });
    }
  
  
  // Run the proper function handler based on the matched Dialogflow intent name
  let intentMap = new Map();const fetch = require('node-fetch');
  intentMap.set('zoneforecastfor', zoneforecastfor);
  intentMap.set('forecastfor', forecastfor);
  intentMap.set('forecast', forecast);
  intentMap.set('tidesfor', tidesfor);
  intentMap.set('tides', tides);
  intentMap.set('locate', locate);
  intentMap.set('observations', observations);
  intentMap.set('noaabuoy', noaabuoy);
  intentMap.set('willitbewindy', willitbewindy);
  intentMap.set('summery', summery);
  return agent.handleRequest(intentMap);
}
