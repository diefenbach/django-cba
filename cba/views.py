import copy
import json
import logging

from django.http import HttpResponse
from django.shortcuts import render
from django.views.generic import View

from . utils import LazyEncoder
# from . utils import time_it

logger = logging.getLogger(__name__)


class CBAView(View):
    """The default base class.

    All views of an cba application should be inherit from this class.
    """
    template = "cba/main.html"

    def __init__(self, **kwargs):
        super(CBAView, self).__init__(**kwargs)
        self._html = []
        self._messages = []

    def get(self, *args, **kwargs):
        """Handles the starting get request.
        """
        # Remove any CBA related stuff from session.
        try:
            del self.request.session["cba"]
        except KeyError:
            pass

        self.root = self.root("root")
        content = self.root.render()
        self.request.session["root"] = self.root

        return render(self.request, self.template, {
            "content": content,
        })

    def post(self, *args, **kwargs):
        """Handles all subsequent ajax calls.
        """
        self.root = self.request.session.get("root")

        self._clear_components_data(self.root)
        self._load_data(self.root)

        handler = self.request.POST.get("handler")
        event_id = self.request.POST.get("event_id")
        component = self.root.get_component(event_id)

        logger.debug("Handler: {} / Component: {}".format(handler, component))

        # Bubbles up the components to find the handler
        while component:
            if hasattr(component, handler):
                component.event_id = event_id
                getattr(component, handler)()
                break
            component = component.parent

        self._collect_components_data(self.root)
        logger.debug("Refreshed components: {}".format(self._html))
        logger.debug("Collected messages: {}".format(self._messages))

        self.request.session["root"] = self.root

        return HttpResponse(
            json.dumps(
                {
                    "html": self._html,
                    "messages": self._messages,
                },
                cls=LazyEncoder
            ),
            content_type='application/json'
        )

    def _clear_components_data(self, root):
        """Clears messsage and html of all components.
        """
        root._html = []
        root._messages = []
        if hasattr(root, "components"):
            for component in root.components:
                component._html = ""
                component._messages = []
                self._clear_components_data(component)

    def _collect_components_data(self, component):
        """Collects refreshed html and messages from all components.
        """
        if component.is_root():
            if component._html:
                self._html.append(component._html)

            if component._messages:
                self._messages.extend(component._messages)

        if hasattr(component, "components"):
            for component in component.components:
                if component._html:
                    self._html.append(component._html)
                if component._messages:
                    self._messages.extend(component._messages)
                self._collect_components_data(component)

    def _load_data(self, root):
        """Loads components with values from the browser.
        """
        if hasattr(root, "components"):
            for component in root.components:
                if component.id in self.request.FILES:
                    if component.multiple:
                        root._components[component.id].value = self.request.FILES.getlist(component.id)
                    else:
                        root._components[component.id].value = self.request.FILES.get(component.id)
                if component.id in self.request.POST:
                    root._components[component.id].value = self.request.POST.get(component.id)
                # The FileInput component sends ids of images which should be delete. Per
                # convention these are send with the key "delete"-<component.id>.
                if "delete-{}".format(component.id) in self.request.POST:
                    root._components[component.id].to_delete = self.request.POST.getlist("delete-{}".format(component.id))
                else:
                    # List elements
                    list_id = "{}[]".format(component.id)
                    if list_id in self.request.POST:
                        root._components[component.id].value = self.request.POST.getlist(list_id)
                self._load_data(component)