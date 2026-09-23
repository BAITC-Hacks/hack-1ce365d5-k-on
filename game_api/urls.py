from django.urls import path

from . import views

app_name = "game_api"

urlpatterns = [
    path("catalog", views.catalog, name="catalog"),
    path("simulate", views.simulate, name="simulate"),
    path("advisor/chat", views.chat, name="advisor-chat"),
]
