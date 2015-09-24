/**
 * Copyright 2014 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

var express = require('express'),
    app = express(),
    server = require('http').createServer(app),
    fs = require('fs'),
    bluemix = require('./config/bluemix'),
    watson = require('watson-developer-cloud'),
    extend = require('util')._extend,
    UAparser = require('ua-parser-js'),
    userAgentParser = new UAparser(),
    http=require('http'),
    https = require('https'),
    qs = require('querystring'),
    MsTranslator = require('mstranslator');

//---Deployment Tracker---------------------------------------------------------
require("cf-deployment-tracker-client").track();

// setup express
require('./config/express')(app);
 

// Setup credentials - populate the url, username and password.
// if you're running on a local node.js environment
var QA_CREDENTIALS = {
    username: 'qa username',
    password: 'qa password',
    version: 'v1',
    dataset: 'healthcare'
};

var STT_CREDENTIALS = {
    username: 'stt username',
    password: 'stt password',
    version:'v1'
};

// setup watson services
var question_and_answer_healthcare = watson.question_and_answer(QA_CREDENTIALS);
var speechToText = watson.speech_to_text(STT_CREDENTIALS);

// setup ms tranlator
var msclient = new MsTranslator({
      client_id: "watson_health_qa_ga"
      , client_secret: "pergUgksCJ7rJJ4jr+cuxsH3p/rIsgCU6fK5RuvxnxY="
    }, true);

// render index page
app.get('/', function(req, res){
    res.render('index');
});

// render index page
app.get('/tos', function(req, res){
    res.render('tos');
});



// Handle the form POST containing an audio file and return transcript (from mobile)
app.post('/transcribe', function(req, res){
    
    var file = req.files.audio;
    var readStream = fs.createReadStream(file.path);
    console.log("opened stream for " + file.path);
        var params = {
        audio:readStream,
        model:'ja-JP_BroadbandModel',
        content_type:'audio/l16; rate=16000; channels=1',
        continuous:"true"
    };
    
    //var params = {
      //  audio:readStream,
        //content_type:'audio/l16; rate=16000; channels=1',
        //continuous:"true"
    //};
         
    speechToText.recognize(params, function(err, response) {
        
        readStream.close();
        
        if (err) {
            return res.status(err.code || 500).json(err);
        } else {
            var result = {};
            if (response.results.length > 0) {
                var finalResults = response.results.filter( isFinalResult );
                
                if ( finalResults.length > 0 ) {
                   result = finalResults[0].alternatives[0];
                   //英訳追加
                   getAccessToken(function (token) {
    				translate(token, result, function (translated) {
        				console.log(translated);
        				result.tlanslated = translated;
    					});
					});
                }
            }
            return res.send( result );
        }
    });
});

function isFinalResult(value) {
    return value.final == true;
}

//handle QA query and return json result (for mobile)
app.get('/ask', function(req, res){
    
    var query = req.query.query;
    
    if ( query != undefined ) {
        question_and_answer_healthcare.ask({ text: query}, function (err, response) {
            if (err){
                return res.status(err.code || 500).json(response);
            } else {
                if (response.length > 0) {
                    var answers = [];
                    
                    for (var x=0; x<response[0].question.evidencelist.length; x++) {
                        var item = {};
                        item.text = response[0].question.evidencelist[x].text;
                        item.value = response[0].question.evidencelist[x].value;
                        answers.push(item);
                    }
                    
                    var result = {
                        answers:answers
                    };
                	return res.send( result );
                }
                return res.send({});
            }
        });
    }
    else {
        return res.status(500).send('Bad Query');
    }
});


//翻訳用API 
//http://qiita.com/kemayako/items/21fe36005e6e729aff77 より
//テスト用
app.get('/testtranslation', function(req, res){
	console.log("test translation start");
	getAccessToken(function (token) {
			console.log("token=" + token);
    		translate(token, '翻訳したい文章', function (translated) {
        		console.log("translated=" + translated);
        		return res.send( translated );
    	});
	});
});

app.get('/npmtranslation', function(req, res){
	console.log("test npm translation start");
	var params = {
      text: 'How\'s it going?'
      , from: 'en'
      , to: 'es'
    };
    // Don't worry about access token, it will be auto-generated if needed.
    msclient.translate(params, function(err, data) {
      console.log(data);
      return res.send( data );
    });
});


function getAccessToken(callback) {
    var body = '';
    var req = https.request({
        host: 'datamarket.accesscontrol.windows.net',
        path: '/v2/OAuth2-13',
        method: 'POST'
    }, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            body += chunk;
        }).on('end', function () {
            var resData = JSON.parse(body);
            callback(resData.access_token);
        });
    }).on('error', function (err) {
        console.log(err);
    });
    var data = {
        'client_id': 'watson_health_qa_ga',
        'client_secret': 'pergUgksCJ7rJJ4jr+cuxsH3p/rIsgCU6fK5RuvxnxY=',
        'scope': 'http://api.microsofttranslator.com',
        'grant_type': 'client_credentials'
    };

    req.write(qs.stringify(data));
    req.end();
}




function translate(token, text, callback) {
    var options = 'appId=Bearer ' + token + '&to=en&text=' + text +
            '&oncomplete=translated';
    var body = '';
    var tmpoptions = 'appId=Bearer ' + token + '&to=es&text=' + 'please translate this';
	console.log("not encode path="+ '/V2/Ajax.svc/Translate?' + tmpoptions);
    console.log("request tmp path="+ '/V2/Ajax.svc/Translate?' + qs.escape(tmpoptions));
    console.log("request path="+ '/V2/Ajax.svc/Translate?' + qs.escape(options));
    var req = http.request({
        host: 'api.microsofttranslator.com',
        path: '	' + qs.escape(options),
        method: 'GET'
    }, function (res) {
    	console.log('res=' + shallowStringify(res));
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            body += chunk;
        }).on('end', function () {
            eval(body);
        });
    }).on('error', function (err) {
        console.log(err);
    });

    req.end();

    function translated(text) {
        callback(text);
    }
}

//debug用
function shallowStringify(obj, onlyProps, skipTypes) {
var objType = typeof(obj);
if(['function', 'undefined'].indexOf(objType)>=0) {
	return objType;
} else if(['string', 'number', 'boolean'].indexOf(objType)>=0) {
	return obj; // will toString
}
// objType == 'object'
var res = '{';
for (var p in obj) { // property in object
if(typeof(onlyProps)!=='undefined' && onlyProps) {
// Only show property names as values may show too much noise.
// After this you can trace more specific properties to debug
	res += p+', ';
} else {
var valType = typeof(obj[p]);
if(typeof(skipTypes)=='undefined') {
	skipTypes = ['function'];
}
if(skipTypes.indexOf(valType)>=0) {
res += p+': '+valType+', ';
} else {
res += p+': '+obj[p]+', ';
}
}
}
res += '}';
return res;
}
// Tests:
function ssTests() {
console.log('shallowStringify string: '+shallowStringify('TestString'));
console.log('shallowStringify number: '+shallowStringify(42));
console.log('shallowStringify boolean: '+shallowStringify(true));
console.log('shallowStringify Array: '+shallowStringify(['TestString', 42, true]));
//console.log('net.createServer\'s socket: '+shallowStringify(socket));
//console.log('net.createServer\'s socket: '+shallowStringify(socket, false, []));
}
ssTests();


// Start server
var port = (process.env.VCAP_APP_PORT || 3000);
server.listen(port);
console.log('listening at:', port);
