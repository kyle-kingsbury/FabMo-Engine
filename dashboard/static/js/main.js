/*
 * main.js is the entry point for the application.
 */
require('../css/font-awesome.css');
require("../css/normalize.css");
require("../css/foundation.min.css");
require("../css/style.css");
require("../css/toastr.min.css");



    // context is the application context
    // dashboard is the bridge between the application context and the apps
    var context = require('./context.js');
    var dashboard = require('./dashboard.js');

    // Vendor libraries

    var $ = require('jquery');
    var Backbone = require('backbone');
    var underscore = require('underscore');

    // Our libraries
    var FabMoAPI = require('./libs/fabmoapi.js');
    var FabMoUI = require('./libs/fabmoui.js');
    var Keyboard = require('./libs/keyboard.js');
    var Keypad = require('./libs/keypad.js');

    var keypad, keyboard;

    // API object defines our connection to the tool.
    var engine = new FabMoAPI();

    var modalIsShown = false;
    var daisyIsShown = false;
    var authorizeDialog = false;
    var interlockDialog = false;
    var isRunning = false;
    var keyPressed = false;
    var isAuth = false;
    var lastInfoSeen = null;
    var consent = '';
    var disconnected = false;
    var last_state_seen = null;
    var in_goto_flag = false;

    // move timer cutoff to var so it can be set in settings later
    var TIMER_DISPLAY_CUTOFF = 5;
    // Detect touch screen
    var supportsTouch = 'ontouchstart' in window || navigator.msMaxTouchPoints;


    // Initial read of engine configuration

    // check user 
    engine.getCurrentUser(function(err,user){
        if(user === undefined){
            window.location.href = '#/authentication';
        } 
    });

    // engine.getUpdaterConfig(function(err, data){
    //    consent =  data.consent_for_beacon;

    //    if (consent === "none") {
    //         showConsent();
    //         $(document).keyup(function(e) {
    //             if (e.keyCode == 27) {
    //                 hideConsent();
    //             }
    //         });
            
    //    }
    //    return consent;
    // }); 
    


    setUpManual = function(){
        engine.getConfig(function(err, config){
            if(err){
                console.log(err);
            } else {
                var manual_config = config.machine.manual;
                if(manual_config.xy_increment) {
                    $('.xy-fixed').val(manual_config.xy_increment);
                    $('.z-fixed').val(manual_config.z_increment);
                } else {
                    $('.xy-fixed').val(0.1);
                    $('.z-fixed').val(0.01);
                }
                $('#manual-move-speed').val(manual_config.xy_speed);
                $('#manual-move-speed').attr('min', manual_config.xy_min);
                $('#manual-move-speed').attr('max', manual_config.xy_max);
                ///hack to get extra axes to show up
                var enabledAxes = {}
                var checkEnabled = ['xam','yam', 'zam', 'aam', 'bam', 'cam'];
                checkEnabled.forEach(function(axi){
                    enabledAxes[axi] = config.driver[axi];
                });
                engine.setConfig({"driver":enabledAxes}, function(err, data) {
                });
            }
        });
    }



    engine.getVersion(function(err, version) {

        context.setEngineVersion(version);

        context.apps = new context.models.Apps();
        // Load the apps from the server
        context.apps.fetch({
            success: function() {


                // Create a FabMo object for the dashboard
                dashboard.setEngine(engine);
                dashboard.ui = new FabMoUI(dashboard.engine);
                dashboard.getNetworkIdentity();

                keyboard = setupKeyboard();
                keypad = setupKeypad();

                // Start the application
                router = new context.Router();
                router.setContext(context);

                dashboard.setRouter(router);

                // Sort of a hack, but works OK.
                $('.loader').hide();

                // Start backbone routing
                Backbone.history.start();

                // Request a status update from the tool
                engine.getStatus();

                dashboard.engine.on('change', function(topic) {
                    if (topic === 'apps') {
                        context.apps.fetch();
                    }
                });

                dashboard.engine.on('status', function(status) {
                    // console.log('Status Object');
                    console.log("status state:  "+status.state);
                    console.log(status);
                    if(status.state == 'dead') {
                        dashboard.showModal({
                            title: 'An Error Occurred!',
                            message: status.info.error,
                            noButton : true
                        });
                        return;
                    }

                    if(status.state === "manual") {
                        if(!status['hideKeypad']) {
                            $('.modalDim').show();
                            $('.manual-drive-modal').show();
                            // if currently running a goto command in manual keypad
                            if(status.stat === 5 &&  status.currentCmd === "goto"){
                                    $('.manual-stop').show();
                                    $('.go-to, .set-coordinates').hide();
                                    keyboard.setEnabled(false);
                                    $('#keypad').hide();
                                    $('.go-to-container').show();
                            } else {
                                // if an axis is selected in go-to or set, then flag is true
                                if(in_goto_flag) {
                                    in_goto_flag = false;
                                    $('.manual-stop').hide();
                                    $('.go-to, .set-coordinates').show();
                                    keyboard.setEnabled(false);
                                    $('#keypad').hide();
                                    $('.go-to-container').show();
                                // Otherwise switch to default manual keypad
                                } else {
                                    $('.manual-stop').hide();
                                    $('.go-to, .set-coordinates').show();
                                    keyboard.setEnabled(true);
                                    $('#keypad').show();
                                    $('.go-to-container').hide();
                                }
                            }
                        }
                    }

                    if(status.state !== "manual" && last_state_seen === "manual") {
                        $('.modalDim').hide();
                        $('.manual-drive-modal').hide();
                        keyboard.setEnabled(false);
                    }

                    if ((status.state != "armed" && last_state_seen === "armed") || 
                        (status.state != "paused" && last_state_seen === "paused") ||
                        (status.state != "interlock" && last_state_seen === "interlock") ||
                        (status.state != "lock" && last_state_seen === "lock")) {
                        dashboard.hideModal();
                        modalIsShown = false;
                    }

                    if (last_state_seen != status.state) {
                        last_state_seen = status.state;
                    }

                    switch (status.state) {
                        case 'running':
                        case 'paused':
                        case 'stopped':
                            if(modalIsShown === false) {
                                dashboard.handlers.showFooter();
                            }
                            break;
                        default:
                            dashboard.handlers.hideFooter();
                            break;
                    }

                    if (status.state != 'idle') {
                        $('#position input').attr('disabled', true);
                        // authenticate.setIsRunning(true);
                    } else {
                        $('#position input').attr('disabled', false);
                        // authenticate.setIsRunning(false);
                    }

                    if (status['info'] && status['info']['id'] != lastInfoSeen) {
                        lastInfoSeen = status['info']['id'];
                        if (status.info['message']) {
                            if(status.state ==="manual"){
                                $('.manual-drive-message').show();
                                $('.manual-drive-message').html(status.info.message);

                            } else if (status.info['timer'] && status.info['timer'] <= TIMER_DISPLAY_CUTOFF) {
                                keypad.setEnabled(false);
                                keyboard.setEnabled(false);
                            } else {
                                keypad.setEnabled(false);
                                keyboard.setEnabled(false);
                                console.log(status['info'])
                                // Default modal options for backwards compatibility
                                modalOptions = {
                                    message: status.info.message
                                }
                                resumeFunction = function() {
                                                    dashboard.engine.resume();
                                                }
                                cancelFunction = function() {
                                                    dashboard.engine.quit();
                                                }
                                //set up input submit
                                if(status['info']['input']) {
                                    modalOptions['input'] = status['info']['input'];
                                    resumeFunction = function() {
                                        var inputVar = $('#inputVar').val();
                                        var inputType = $('#inputType').val();
                                        var inputVal = $.trim($('#inputVal').val());
                                        dashboard.engine.resume({'var': inputVar, 'type': inputType, 'val': inputVal});
                                        //  TODO: stop modal from closing on click so we can validate.
                                        // if(inputVal != '') {
                                        //     $('.inputError').hide();
                                        //     dashboard.engine.resume({'var': inputVar, 'val': inputVal});
                                        // } else {
                                        //     $('.inputError').show();
                                        // }
                                    }
                                }
                                modalOptions.okText = 'Resume',
                                modalOptions.cancelText = 'Quit',
                                modalOptions.ok = resumeFunction,
                                modalOptions.cancel = cancelFunction
                                if (status.info['custom']) {
                                    // Custom button action and text
                                    if (status.info.custom['ok']) {
                                        modalOptions.okText = status.info.custom.ok['text']
                                        switch (status.info.custom.ok['func']) {
                                            case 'resume':
                                                modalOptions.ok = resumeFunction
                                                break;
                                            case 'quit':
                                                modalOptions.ok = cancelFunction
                                                break;
                                            default:
                                                modalOptions.ok = false
                                        }
                                    }
                                    if (status.info.custom['cancel']) {
                                        modalOptions.cancelText = status.info.custom.cancel['text']
                                        switch (status.info.custom.cancel['func']) {
                                            case 'resume':
                                                modalOptions.cancel = resumeFunction
                                                break;
                                            case 'quit':
                                                modalOptions.cancel = cancelFunction
                                                break;
                                            default:
                                                modalOptions.cancel = function() {
                                                    modalIsShown = false;
                                                }
                                        }
                                    }
                                    if (status.info.custom['detail']) {
                                        modalOptions['detail'] = status.info.custom['detail']
                                    }
                                    if (status.info.custom['title']) {
                                        modalOptions['title'] = status.info.custom['title']
                                    }
                                    if (status.info.custom['noButton']) {
                                        modalOptions.noButton = true
                                    }
                                }
                                dashboard.showModal(modalOptions);
                                modalIsShown = true;
                                dashboard.handlers.hideFooter();
                            }
                        } else if (status.info['error']) {
                            if (dashboard.engine.status.job) {
                                var detailHTML = '<p>' +
                                    '<b>Job Name:  </b>' + dashboard.engine.status.job.name + '<br />' +
                                    '<b>Job Description:  </b>' + dashboard.engine.status.job.description +
                                    '</p>'
                            } else {
                                var detailHTML = '<p>Check the <a style="text-decoration: underline;" href="/log">debug log</a> for more information.</p>';
                            }
                            dashboard.showModal({
                                title: 'An Error Occurred!',
                                message: status.info.error,
                                detail: detailHTML,
                                cancelText: 'Close',
                                cancel: function() {
                                    modalIsShown = false;
                                }
                            });
                            modalIsShown = true;
                            dashboard.handlers.hideFooter();
                        }
                        // quitFlag prevents authorize dialog from popping up
                        // after quitting from authorize dialog
                    } else if (status.state === 'armed' && status.quitFlag === false) {
                        authorizeDialog = true;
                            keypad.setEnabled(false);
                            keyboard.setEnabled(false);
                        dashboard.showModal({
                            title: 'Authorization Required!',
                            message: 'To authorize your tool, press and hold the start button for one second.',
                            cancelText: 'Quit',
                            cancel: function() {
                                authorizeDialog = false;
                                dashboard.engine.quit(function(err, result) {
                                                            if (err) {
                                                              console.log("ERRROR: " + err);
                                                            }
                                                        }
                                                    );
                            }
                        });
                    } else if (status.state === 'interlock' && status.resumeFlag === false) {
                        interlockDialog = true;
                            keypad.setEnabled(false);
                            keyboard.setEnabled(false);
                        dashboard.showModal({
                            title: 'Safety Interlock Active!',
                            message: 'You cannot perform the specified action with the safety interlock open.  Please close the safety interlock to continue.',
                            cancelText: 'Quit',
                            cancel: function() {
                                interlockDialog = false;
                                dashboard.engine.quit(function(err, result) {
                                                            if (err) {
                                                              console.log("ERRROR: " + err);
                                                            }
                                                        }
                                                    );
                            },
                            okText: 'Resume',
                            ok: function() {
                                dashboard.engine.resume();
                            }
          
                        });
                    } else if (status.state === 'lock') {
                        interlockDialog = true;
                            keypad.setEnabled(false);
                            keyboard.setEnabled(false);
                        dashboard.showModal({
                            title: 'Stop Input Activated!',
                            message: 'Please release any Stop Input before continuing.',
                            cancelText: 'Quit',
                            cancel: function() {
                                interlockDialog = false;
                                dashboard.engine.quit(function(err, result) {
                                                            if (err) {
                                                            console.log("ERRROR: " + err);
                                                            }
                                                        }
                                                    );
                            },
                            okText: 'Resume',
                            ok: function() {
                                dashboard.engine.resume();
                            }
        
                        });
                    } 

                });

            }
        });
    });


    function getManualMoveSpeed(move) {
        var speed_ips = null;
        if ($('#manual-move-speed').val()){
            speed_ips = $('#manual-move-speed').val();
        }
        return speed_ips;
    }

    function getManualMoveJerk(move){
        var jerk = null;
        try {
            switch (move.axis) {
                case 'x':
                case 'y':
                    jerk = engine.config.machine.manual.xy_jerk;
                    break;
                case 'z':
                    jerk = engine.config.machine.manual.z_jerk;
                    break;
            }
        } catch (e) {
            console.error(e);
        }
        return jerk;
    }

    function getManualNudgeIncrement(move) {
        var increment_inches = null;
        try {
            switch (move.axis) {
                case 'x':
                case 'y':
                    increment_inches = engine.config.machine.manual.xy_increment;
                    break;
                case 'z':
                    increment_inches = engine.config.machine.manual.z_increment;
                    break;
                case 'a':
                case 'b':
                    increment_inches = engine.config.machine.manual.ab_increment;
                    break;
            }
        } catch (e) {
            console.error(e);
        }
        return increment_inches;
    }

    function setupKeyboard() {
        var keyboard = new Keyboard();
        keyboard.on('go', function(move) {
            if(move.axis === 'z'){
                dashboard.engine.manualStart(move.axis, move.dir * 60.0 * (getManualMoveSpeed(move) / 2 || 0.1));
            } else if (move) {
                dashboard.engine.manualStart(move.axis, move.dir * 60.0 * (getManualMoveSpeed(move) || 0.1));
            }
        });

        keyboard.on('stop', function(evt) {
            dashboard.engine.manualStop();
        });

        keyboard.on('nudge', function(nudge) {
            dashboard.engine.manualMoveFixed(nudge.axis, 60 * getManualMoveSpeed(nudge), nudge.dir * getManualNudgeIncrement(nudge))
        });

        return keyboard;
    }

    function setupKeypad() {
        var keypad = new Keypad('#keypad');
        keypad.on('go', function(move) {
            if (move.second_axis) {
                dashboard.engine.manualStart(move.axis, move.dir * 60.0 * (getManualMoveSpeed(move) || 0.1), move.second_axis, move.second_dir * 60.0 * (getManualMoveSpeed(move) || 0.1));
            } else if(move.axis === 'z_fast'){
                dashboard.engine.manualStart('z', move.dir * 60.0 * (engine.config.machine.manual.z_fast_speed));
            } else if(move.axis === 'z_slow'){
                dashboard.engine.manualStart('z', move.dir * 60.0 * (engine.config.machine.manual.z_slow_speed));
            } else if (move) {
                dashboard.engine.manualStart(move.axis, move.dir * 60.0 * (getManualMoveSpeed(move) || 0.1));
            }
        });

        keypad.on('stop', function(evt) {
            keyPressed = false;
            dashboard.engine.manualStop();
        });

        keypad.on('nudge', function(nudge) {
            var speed = getManualMoveSpeed(nudge);
            var increment = getManualNudgeIncrement(nudge);
            // var jerk = getManualMoveJerk(nudge);
            if( nudge.second_axis){
                dashboard.engine.manualMoveFixed(nudge.axis, 60 * speed, nudge.dir * increment, nudge.second_axis, nudge.second_dir * increment);
                
            } else {
                dashboard.engine.manualMoveFixed(nudge.axis, 60 * getManualMoveSpeed(nudge), nudge.dir * getManualNudgeIncrement(nudge));
            }
        });

        return keypad;
    }

    $('.manual-drive-exit').on('click', function(){
        $('.manual-drive-message').html('');
        $('.manual-drive-message').hide();
        dashboard.engine.manualExit();
    })

    $('.manual-drive-enter').on('click', function(){
        setUpManual();
        dashboard.engine.manualEnter();
    })


    function showConsent () {
           $('.modalDim').show();
           $('#beacon_consent_container').show();
         
    }
    function hideConsent (){
        $('.modalDim').hide();
        $('#beacon_consent_container').hide();
    }

    $('#beacon_consent_button').on('click', function(conf){
                conf = {consent_for_beacon : "true"};
                dashboard.engine.setUpdaterConfig(conf,function(err){
                if(err){
                    return;
                }
                });
                consent = "true";
            $('.modalDim').hide();
            $('#beacon_consent_container').hide();
    });

    function showDaisy(callback) {

        if (daisyIsShown) {
            return;
        } else {
            dashboard.hideModal();
            daisyIsShown = true;
             dashboard.showModal({
                    title: 'Waiting for FabMo...',
                    message: '<i class="fa fa-cog fa-spin" aria-hidden="true" style="font-size:40px;color:#313366" ></i>',
                    noButton: true,
                    noLogo: true
                });
        }
    }



    function hideDaisy(callback) {
        var callback = callback || function() {};
        if (!daisyIsShown) {
            return callback();
        }
        daisyIsShown = false;
        dashboard.hideModal();
    }

    // listen for escape key press to quit the engine ctrl and k enters manual
    $(document).on('keydown', function(e) {
        if(e.keyCode === 27) {
            console.warn("ESC key pressed - quitting engine.");
            dashboard.engine.manualExit();
            // keyboard.setEnabled(true);
        } else if (e.keyCode === 75 && e.ctrlKey ) {
			dashboard.engine.manualEnter()
		}
    });





    //goto this location
    var axisValues = [];
    getAxis = function () {
        $('.axi').each(function() {
            var strings = this.getAttribute('class').split(" ")[0];
            var axis = strings.slice(-1).toUpperCase();
            axisValues.push({
                "className": ("." + strings),
                "axis": axis
            });
        });
    }


    $('.go-to').on('mousedown', function() {
        var move = {}
        $('.modal-axi:visible').each(function(){
            move[$(this).attr('id')] = parseFloat($(this).val());
        });
        dashboard.engine.goto(move);
    });

    $('.manual-stop').on('mousedown', function() {
        dashboard.engine.manualStop(); 
    });

    $('.set-coordinates').on('mousedown', function() {
        var move = {}
        $('.modal-axi:visible').each(function(){
            move[$(this).attr('id')] = parseFloat($(this).val());
        });
        dashboard.engine.set(move);
    });

    $('.fixed-switch input').on('change', function(){

        if  ($('.fixed-switch input').is(':checked')) {
            $('.drive-button').addClass('drive-button-fixed');
            $('.slidecontainer').hide();
            $('.fixed-input-container').show();
            $('.fixed-input-container').css('display', 'flex');

        } else {
            $('.drive-button').removeClass('drive-button-fixed');
            $('.slidecontainer').show();
            $('.fixed-input-container').hide();
        }
    });


    $('#manual-move-speed').on('change', function(){
        newDefault = $('#manual-move-speed').val();
        dashboard.engine.setConfig({machine:{manual:{xy_speed:newDefault}}}, function(err, data){
            if(err){
                console.log(err);
            } 
        });
    });

    $('.xy-fixed').on('change', function(){
        keyboard.setEnabled(false);
        newDefault = $('.xy-fixed').val();
        dashboard.engine.setConfig({machine:{manual:{xy_increment:newDefault}}}, function(err, data){
            if(err){
                console.log(err);
            } else  {
                engine.config.machine.manual.xy_increment = newDefault;
            }
        });
    });

    $('.z-fixed').on('change', function(){
        keyboard.setEnabled(false);
        newDefault = $('.z-fixed').val();
        dashboard.engine.setConfig({machine:{manual:{z_increment:newDefault}}}, function(err, data){
            if(err){
                console.log(err);
            } else {
                engine.config.machine.manual.z_increment = newDefault;
            }
        });
    });   

    $('.axi').on('click', function(e) {
        e.stopPropagation();
        $('#keypad').hide();
        $('.go-to-container').show();
    });

    $('.axi').on('focus', function(e) {
        in_goto_flag = true;
        e.stopPropagation();
        $(this).val(parseFloat($(this).val().toString()));
        $(this).select();
        keyboard.setEnabled(false);
    });

    $('.fixed-step-value').on('focus', function(e){
        e.stopPropagation();
        $(this).select();
        keyboard.setEnabled(false);
    });


    // manual keypad movement
    $('.manual-drive-modal').not('.fixed-step-value').on('click', function(e) {
            $('.posx').val($('.posx').val());
            $('.posy').val($('.posy').val());
            $('.posz').val($('.posz').val());
            $('.posa').val($('.posa').val());
            $('.posb').val($('.posb').val());
            $('.posc').val($('.posc').val());
            in_goto_flag = false;
            $('#keypad').show();
            $('.go-to-container').hide();
            if($(event.target).hasClass('fixed-step-value')){
                keyboard.setEnabled(false);
            } else {
                keyboard.setEnabled(true);
            }


    });




    $('.axi').keyup(function(e) {
        keyboard.setEnabled(false);
        if (e.keyCode == 13) {
            var move = {}
            $('.modal-axi:visible').each(function(){
                move[$(this).attr('id')] = parseFloat($(this).val());
            });
            dashboard.engine.goto(move);
        }
    });

    $('.zero-button').on('click', function() {
        var axi = $(this).parent('div').find('input').attr('id');
        var obj = {};
        obj[axi] = 0;
console.log('zero- ',axi,obj,obj[axi]);        
        dashboard.engine.set(obj)
    });


    $('#connection-strength-indicator').on('click', function(evt) {
        dashboard.launchApp('network-manager');
    });

	engine.on('authentication_failed',function(message){
	    if(message==="not authenticated"){
	        window.location='#/authentication?message=not-authenticated';
	    }
	    else if(message==="kicked out"){
	        window.location='#/authentication?message=kicked-out';
	    }
	});


    engine.on('disconnect', function() {
        if (!disconnected) {
            disconnected = true;
            setConnectionStrength(null);
            hideConsent();
            showDaisy();
            
        }
    });

    engine.on('connect', function() {
        if (disconnected) {
            disconnected = false;
            setConnectionStrength(5);
        }
        hideDaisy(null);
        if (consent === "none") {
            showConsent();
        }
    });

    

    function setConnectionStrength(level) {
        var onclass = 'on';
        if (level === null) {
            level = 4;
            onclass = 'err';
        }
        for (i = 1; i < 5; i++) {
            var bar = $('#cs' + i);
            if (i <= level) {
                bar.attr('class', onclass);
            } else {
                bar.attr('class', 'off');
            }
        }
    }

    var signal_window = [];
    var err_count = 0;

    function ping() {
        engine.ping(function(err, time) {
            // 5-point Moving average
            signal_window.push(time);
            if (signal_window.length > 5) {
                signal_window.shift(0);
            }
            var sum = 0;
            for (var i = 0; i < signal_window.length; i++) {
                sum += signal_window[i];
            }
            var avg = sum / signal_window.length;

            if (err) {
                console.error(err);
            } else {
                if (avg < 100) {
                    setConnectionStrength(4);
                } else if (avg < 200) {
                    setConnectionStrength(3);
                } else if (avg < 400) {
                    setConnectionStrength(2);
                } else if (avg < 800) {
                    setConnectionStrength(1);
                } else {
                    setConnectionStrength(0);
                }
            }
            setTimeout(ping, 2000);
        });
    };


    ping();
    
    engine.sendTime();

    function touchScreen() {
        if (supportsTouch && window.innerWidth < 800) {
            $('#app-client-container').css({
                '-webkit-overflow-scrolling': 'touch',
                'overflow-y': 'scroll'
            });
        }
    }
    touchScreen();

$('.icon_sign_out').on('click', function(e){
    e.preventDefault();
    dashboard.showModal({
        title : 'Log Out?',
        message : 'Are you sure you want to sign out of this machine?',
        okText : 'Yes',
        cancelText : 'No',
        ok : function() {
            window.location.href = '#/authentication';
        },
        cancel : function() {}
    });
});

setUpManual();



