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
  center: [138.9525, 35.0236],
  zoom: 8.82,
  minZoom: 4,
  maxZoom: 14,
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
    '<a href="https://twitter.com/shi__works" target="_blank">X(旧Twitter)</a> | <a href="https://github.com/shiwaku/depth-contour-map-on-maplibre">GitHub</a>'
}));

// 3D地形コントロール
map.addControl(
  new maplibregl.TerrainControl({
    source: 'dem-tiles',
    exaggeration: 1 // 標高を強調する倍率
  })
);

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

  // 段彩図レイヤー
  map.addLayer({
    id: "dem-color-relief",
    type: "color-relief",
    source: "dem-tiles",
    paint: {
      'color-relief-color': [
        'interpolate',
        ['linear'],
        ['elevation'],
        -1000, 'rgb(0,0,101)',
        -500, 'rgb(0,0,152)',
        -200, 'rgb(0,0,203)',
        -100, 'rgb(0,0,255)',
        -50, 'rgb(50,50,255)',
        -20, 'rgb(101,101,255)',
        -10, 'rgb(153,153,255)',
        -5, 'rgb(204,204,255)',
        0, 'rgb(39, 144, 116)',
        5, 'rgb(57, 169, 29)',
        10, 'rgb(111, 186, 5)',
        20, 'rgb(160, 201, 4)',
        50, 'rgb(205, 216, 2)',
        100, 'rgb(244, 221, 4)',
        200, 'rgb(251, 194, 14)',
        500, 'rgb(252, 163, 21)',
        1000, 'rgb(253, 128, 20)',
        2000, 'rgb(254, 85, 14)',
        3000, 'rgb(243, 36, 13)',
        4000, 'rgb(215, 5, 13)'
      ],
      "color-relief-opacity": 0.6
    },
  });

  // 陰影起伏図レイヤー
  map.addLayer({
    id: "hillshade",
    type: "hillshade",
    source: "dem-tiles",
    minzoom: 1,
    maxzoom: 18,
    layout: { visibility: 'visible' },
    paint: { 'hillshade-shadow-color': 'rgba(0,0,0,0.3)' }
  });

  // 標高タイルソース（等深線）
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

  // 等深線ソース
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
          12: [5, 50],
          13: [5, 50],
          14: [5, 50],
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

  // 等深線レイヤー
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

  // 等深線ラベル
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

  if (zoomLevel > 18) {
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
