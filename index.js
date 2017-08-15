/**
 * Automatic Image resize, reduce with AWS Lambda
 * Lambda main handler
 *
 * @author Yoshiaki Sugimoto
 * @created 2015/10/29
 */
"use strict";

const ImageProcessor = require("./lib/ImageProcessor");
const S3FileSystem   = require("./lib/S3FileSystem");
const eventParser    = require("./lib/EventParser");
const Config         = require("./lib/Config");
const fs             = require("fs");
const path           = require("path");

var mysql = require('promise-mysql');

var connection, tinpon, productVariations, tinponId, s3ObjectKey;
let host = "wegoloco-cluster.cluster-cb5jwvcwolur.eu-west-1.rds.amazonaws.com";
let user = "admin";
let password = "1269Y5$ST50j";
let database = 'wegoloco';
let charset = 'utf8mb4';

// Lambda Handler
exports.handler = (event, context, callback) => {

    console.log("event ", event, event.s3);
    var eventRecord = eventParser(event);

    // Tinpons/23/main/1.png
    s3ObjectKey = eventRecord.object.key;

    if (eventRecord) {
        process(eventRecord, callback);
    } else {
        console.log(JSON.stringify(event));
        callback('Unsupported or invalid event');
        return;
    }
};

function process(s3Object, callback) {
    const configPath = path.resolve(__dirname, "config.json");
    const fileSystem = new S3FileSystem();
    const processor  = new ImageProcessor(fileSystem, s3Object);
    const config     = new Config(
        JSON.parse(fs.readFileSync(configPath, { encoding: "utf8" }))
    );

    processor.run(config)
    .then((processedImages) => {
        const message = "OK, " + processedImages + " images were processed.";

      //  console.log("path ", globalImage.Key);
        return saveImageInRDS();
    })
    .then((message) => {
      console.log("Message ",message);
      callback(null, message);
      return;
    })
    .catch((messages) => {
        if ( messages === "Object was already processed." ) {
            console.log("Image already processed");
            callback(null, "Image already processed");
            return;
        } else if ( messages === "Empty file or directory." ) {
            console.log( "Image file is broken or it's a folder" );
            callback( null, "Image file is broken or it's a folder" );
            return;
        } else {
            callback("Error processing " + s3Object.object.key + ": " + messages);
            return;
        }
    });
}

var saveImageInRDS = function() {
    var promise = new Promise((resolve, reject) => {
      mysql.createConnection({
          host: host,
          user: user,
          password: password,
          database: database,
          charset: charset
      }).then(function(conn){
        connection = conn

        const s3KeyArray = s3ObjectKey.split("/");

        console.log("RDS connection established");
        var query = connection.query("INSERT INTO tinpon_images SET tinpon_id = '"+s3KeyArray[1]+"', type = '"+s3KeyArray[2]+"', image = '"+s3ObjectKey+"';");
        return query;
      }).then( function(result) {
        connection.end();
        resolve("SUCCESS: RDS image inserted");
      }).catch( function(error) {
        reject(error);
      });
      resolve("Seuccess");
    });

    return promise;
}
