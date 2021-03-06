const CBA = {

    DEBUG: true,

    getUUID: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & (0x3 | 0x8));
            return v.toString(16);
        });
    },

    collectComponents: () => {
        const object = new FormData();

        $('input.component, textarea.component, select').each(function() {
            const id = $(this).attr('id');

            if ($(this).attr('type') == 'file') {
                for (const file of $(this)[0].files) {
                    object.append(id, file);
                }
            } else if ($(this).attr('type') == 'checkbox') {
                if ($(this).is(':checked')) {
                    const value = $(this).val();
                    const name = $(this).attr('name');
                    object.append(`${name}[]`, value);
                }
            } else if ($(this).attr('type') == 'radio') {
                if ($(this).is(':checked')) {
                    const value = $(this).val();
                    const name = $(this).attr('name');
                    object.append(name, value);
                }
            } else if ($(this).is('select')) {
                if ($(this).attr('multiple')) {
                    for (const value of $(this).val()) {
                        object.append(`${id}[]`, value);
                    }
                } else {
                    object.append(id, $(this).val());
                }
            } else {
                let value = $(this).val();
                // jquery doesn't post empty lists
                if (value == false) {
                    value = '';
                }
                object.append(id, value);
            }
        });
        return object;
    },

    replaceHTML: result => {
        for (const html of result) {
            if ($(html[0]).hasClass('render')) {
                $(html[0]).replaceWith(html[1]);
            } else {
                $(html[0]).parents('.render:first').replaceWith(html[1]);
            }
        }
    },

    addMessages: messages => {
        for (const message of messages) {
            const id = CBA.getUUID();
            $('#messages').append(`<div class="ui large ${message.type} message" id="message-${id}">${message.text}</div>`);
            setTimeout(() => {
                $(`#message-${id}`).fadeOut(500, function() {
                    $(this).remove();
                });
            },
            3000);
        }
    },

    defaultAjaxAction: (element, event, handler, createState) => {
        const data = CBA.collectComponents();
        try {
            data.append('source_id', event.originalEvent.dataTransfer.getData('text'));
        } catch (e) {}

        const elementId = element.attr('id');
        const componentId = element.attr('cid') || elementId;
        const componentValue = element.attr('component_value') || componentId;
        data.append('handler', handler);
        data.append('element_id', elementId);
        data.append('component_id', componentId);
        data.append('component_value', componentValue);
        data.append('key_code', event.keyCode);
        data.append('csrfmiddlewaretoken', $('input[name=csrfmiddlewaretoken]').attr('value'));

        if (CBA.DEBUG) {
            console.log(data);
        }

        let state = history.state;
        if (state != null) {
            state = parseInt(state, 10) + 1;
        } else {
            state = 1;
        }

        data.append('state', state);
        data.append('create_state', createState)

        $.ajax({
            url: '',
            type: 'POST',
            data,
            processData: false,
            contentType: false,
            success: result => {
                if (createState) {
                    history.pushState(state, null, `#${state}`);
                }
                CBA.replaceHTML(result.html);
                CBA.addMessages(result.messages);
            },
        });
    },

    defaultJSAction: (element, event, handler) => {
        const fn = window[handler];
        fn(element);
    },

    handleEvent: (element, event) => {
        const handlerString = element.attr(`${event.type}_handler`);
        const handlerState = handlerString.split('|');

        let createState = false;
        if (handlerState[1]) {
            createState = true;
        }

        const handler = handlerState[0].split(':');

        if (event.type === 'keyup') {
            if (handler[2]) {
                let keys = JSON.parse(handler[2]);
                if (!$.isArray(keys)) {
                    keys = [keys];
                }
                if ($.inArray(event.keyCode, keys) === -1) {
                    if (CBA.DEBUG) {
                        console.log(`${event.keyCode} is not in ${handler[2]}`);
                    }
                    return false;
                }
            }
        }

        if (handler[0] === 'server') {
            CBA.defaultAjaxAction(element, event, handler[1], createState);
        } else if (handler[0] === 'client') {
            CBA.defaultJSAction(element, event, handler[1], createState);
        }

        return true;
    },
};

// Register Events
$(() => {
    $('body').on('click', '.click', function(event) {
        CBA.handleEvent($(this), event);
        return false;
    });

    $('body').on('change', '.change', function(event) {
        // Unfortunately semantic-ui wraps the original select with a div and
        // copy its classes to this.
        let element = $(this);
        if ($(this).hasClass('dropdown')) {
            element = $(this).children('select:first');
        }
        CBA.handleEvent(element, event);
        return false;
    });

    $('body').on('mouseover', '.mouseover', function(event) {
        CBA.handleEvent($(this), event);
        return false;
    });

    $('body').on('mouseout', '.mouseout', function(event) {
        CBA.handleEvent($(this), event);
        return false;
    });

    $('body').on('keyup', '.keyup', function(event) {
        CBA.handleEvent($(this), event);
        return false;
    });

    // DnD: Stores id of the draggable component for later use
    $('body').on('dragstart', '.draggable', function(event) {
        event.originalEvent.dataTransfer.setData('text', event.target.id);
    });

    // DnD: handles drop event
    $('body').on('drop', '.droppable', function(event) {
        CBA.handleEvent($(this), event);
        return false;
    });

    // DnD: Allows drop
    $('body').on('dragover', '.droppable', function(event) {
        return false;
    });

    // Table Component: selects row if clicked.
    $('body').on('click', 'tr', function(event) {
        $(this).siblings('tr').removeClass('selected');
        $(this).addClass('selected');
    });

    // FileInput Component: toggles checkbox when the image is clicked.
    $('body').on('click', '.file-input img', function(event) {
        const checkbox = $(this).siblings('.checkbox').children('input');
        checkbox.prop('checked', !checkbox.prop('checked'));
    });

    // Handles history changes
    window.addEventListener('popstate', function(e) {
        const data = new FormData();
        data.append('action', 'reload');
        data.append('state', e.state);

        $.ajax({
            url: '',
            type: 'POST',
            data,
            processData: false,
            contentType: false,
            success: result => {
                CBA.replaceHTML(result.html);
            },
        });
    });
});
