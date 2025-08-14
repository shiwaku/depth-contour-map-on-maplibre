// Protocolの設定
let protocol = new pmtiles.Protocol();
maplibregl.addProtocol('pmtiles', (request) => {
  return new Promise((resolve, reject) => {
    const callback = (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({ data });
      }
    };
    protocol.tile(request, callback);
  });
});

// マップの初期化
const map = new maplibregl.Map({
  container: 'map',
  // style: 'https://tile.openstreetmap.jp/styles/maptiler-basic-ja/style.json',
  style: './basic.json',
  center: [130.50264, 30.23973],
  zoom: 11.99,
  minZoom: 4,
  maxZoom: 11.99,
  pitch: 0,
  maxPitch: 85,
  bearing: 0,
  hash: true,
  attributionControl: false
});

// ズーム・回転
map.addControl(new maplibregl.NavigationControl());

// フルスクリーン
map.addControl(new maplibregl.FullscreenControl());

// 現在位置表示
map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: false },
  fitBoundsOptions: { maxZoom: 18 },
  trackUserLocation: true,
  showUserLocation: true
}));

// スケール表示
map.addControl(new maplibregl.ScaleControl({
  maxWidth: 200,
  unit: 'metric'
}));

// Attributionを折りたたみ表示
map.addControl(new maplibregl.AttributionControl({
  compact: true,
  customAttribution:
    '<a href="https://twitter.com/shi__works" target="_blank">X(旧Twitter)</a> | <a href="">GitHub</a>'
}));

/*
// 3D地形コントロール
map.addControl(
  new maplibregl.TerrainControl({
    source: 'mapzen',
    exaggeration: 4 // 標高を強調する倍率
  })
);
*/

map.on('load', () => {
  // 標高タイルソース
  map.addSource("dem-tiles", {
    type: 'raster-dem',
    // tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    // tiles: ['https://tiles.stadiamaps.com/data/terrarium/{z}/{x}/{y}.png'],
    tiles: ['https://gbank.gsj.jp/seamless/elev/terrainRGB/mixed/{z}/{y}/{x}.png'],
    attribution: '<a href="https://tiles.gsj.jp/tiles/elev/tiles.html">産総研シームレス標高タイル</a>',
    // "encoding": "terrarium"
    "encoding": "mapbox"
  });

  // 標高タイルセット
  map.setTerrain({ source: 'dem-tiles', exaggeration: 1 });

  // スライダーでシームレス標高タイルの高さの倍率を制御
  const exaggeration_sliderOpacity = document.getElementById('exaggeration-slider-opacity');
  const exaggeration_sliderOpacityValue = document.getElementById('exaggeration-slider-opacity-value');

  exaggeration_sliderOpacity.addEventListener('input', (e) => {
    const exaggerationValue = parseFloat(e.target.value);
    map.setTerrain({ source: 'dem-tiles', exaggeration: exaggerationValue });
    exaggeration_sliderOpacityValue.textContent = e.target.value + '倍';
  });

  /*
  // 陰影起伏図レイヤー
  map.addLayer({
    id: "hillshade",
    type: "hillshade",
    source: "dem-tiles",
    minzoom: 1,
    maxzoom: 18,
    layout: { visibility: 'visible' },
    paint: { 'hillshade-shadow-color': 'rgba(204,204,204,0.3)' }
  });
  */

  const demSource = new mlcontour.DemSource({
    url: "https://gbank.gsj.jp/seamless/elev/terrainRGB/mixed/{z}/{y}/{x}.png",
    // encoding: "terrarium",
    encoding: "mapbox",
    maxzoom: 9,
    worker: true,      // WebWorkerで計算
    cacheSize: 100,    // 直近タイルのキャッシュ数
    timeoutMs: 10_000, // フェッチのタイムアウト
  });
  demSource.setupMaplibre(maplibregl);

  map.addSource("contour-source", {
    type: "vector",
    tiles: [
      demSource.contourProtocolUrl({
        multiplier: 1, // m→m
        thresholds: {
          // zoom: [minor, major]
          5: [200, 2000],
          6: [200, 1000],
          7: [100, 500],
          8: [100, 200],
          9: [50, 100],
          10: [20, 100],
          11: [10, 100],
          // 12: [5, 50],
          // 14: [5, 50],
          // 15: [5, 20],
        },
        // optional override
        contourLayer: "contours",
        elevationKey: "ele",
        levelKey: "level",
        extent: 4096,
        buffer: 1,
      }),
    ],
    maxzoom: 18,
  });

  map.addLayer({
    id: "contour-lines",
    type: "line",
    source: "contour-source",
    "source-layer": "contours",
    paint: {
      "line-color": "rgba(0, 0, 0, 0.5)",
      // level = highest index in thresholds array the elevation is a multiple of
      "line-width": ["match", ["get", "level"], 1, 1, 0.5],
    },
  });

  map.addLayer({
    id: "contour-labels",
    type: "symbol",
    source: "contour-source",
    "source-layer": "contours",
    // filter: [">", ["get", "level"], 0],
    layout: {
      "symbol-placement": "line",
      "text-size": 14,
      "text-field": ["concat", ["number-format", ["get", "ele"], {}], "m"],
      // "text-font": ["Noto Sans Bold"],
      'text-font': ['NotoSansJP-Regular'],
    },
    paint: {
      "text-color": "white",
      "text-halo-color": "black",
      "text-halo-width": 1,
    },
  });
});

// 地図の中心座標と標高を表示
function updateCoordsDisplay() {
  const center = map.getCenter();
  const lat = center.lat.toFixed(5);
  const lng = center.lng.toFixed(5);
  const zoomLevel = Math.trunc(map.getZoom());

  const elevTile = 'https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png'; // 統合DEM
  // const elevTile = "https://tiles.gsj.jp/tiles/elev/land/{z}/{y}/{x}.png"; // 陸域統合DEM

  if (zoomLevel > 15) {
    document.getElementById("coords").innerHTML =
      "中心座標: " + lat + ", " + lng + "<br>" +
      "ズームレベル: " + map.getZoom().toFixed(2) + "<br>" +
      "標高(ZL15以下): 取得できません<br>" +
      '<a href="https://www.google.com/maps?q=' + lat + "," + lng + '&hl=ja" target="_blank">🌎GoogleMaps</a> ' +
      '<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + "," + lng + '&hl=ja" target="_blank">📷StreetView</a>';
  } else {
    getNumericalValue(elevTile, lat, lng, zoomLevel, 0.01, 0, -(2 ** 23)).then(v => {
      document.getElementById("coords").innerHTML =
        "中心座標: " + lat + ", " + lng + "<br>" +
        "ズームレベル: " + map.getZoom().toFixed(2) + "<br>" +
        "標高(ZL15以下):" + (isNaN(v) ? "取得できません" : v.toFixed(2) + "m") + "<br>" +
        '<a href="https://www.google.com/maps?q=' + lat + "," + lng + '&hl=ja" target="_blank">🌎GoogleMaps</a> ' +
        '<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' + lat + "," + lng + '&hl=ja" target="_blank">📷StreetView</a>';
    });
  }
}

// 地図移動で更新
map.on("move", updateCoordsDisplay);

/// ****************
// latLngToTile 緯度経度→タイル座標
/// ****************
function latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = ((lng / 180 + 1) * n) / 2;
  const latRad = (lat * Math.PI) / 180;
  const y = (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2;
  return { x, y };
}

/// ****************
// getNumericalValue タイルURLからピクセル値→標高へ
/// ****************
function getNumericalValue(url, lat, lng, z, factor = 1, offset = 0, invalid = undefined) {
  console.log("z=" + z + " " + "lat=" + lat + " " + "lng=" + lng);
  return new Promise(function (resolve, reject) {
    const p = latLngToTile(lat, lng, z),
      x = Math.floor(p.x), // タイルX
      y = Math.floor(p.y), // タイルY
      i = (p.x - x) * 256, // タイル内i
      j = (p.y - y) * 256, // タイル内j
      img = new Image();

    console.log("タイルURL=" + url);
    console.log("タイルX座標=" + x + " " + "タイルY座標=" + y);

    img.crossOrigin = "anonymous"; // 画像からデータ抽出に必要
    img.onload = function () {
      const canvas = document.createElement("canvas"),
        context = canvas.getContext("2d");
      let r2, v, data;

      canvas.width = 1;
      canvas.height = 1;
      context.drawImage(img, i, j, 1, 1, 0, 0, 1, 1);
      data = context.getImageData(0, 0, 1, 1).data;
      r2 = data[0] < 2 ** 7 ? data[0] : data[0] - 2 ** 8;
      v = r2 * 2 ** 16 + data[1] * 2 ** 8 + data[2];
      if (data[3] !== 255 || (invalid != undefined && v == invalid)) {
        v = NaN;
      }
      resolve(v * factor + offset);
    };
    img.onerror = function () {
      reject(null);
    };
    img.src = url.replace("{z}", z).replace("{y}", y).replace("{x}", x);
  });
}
