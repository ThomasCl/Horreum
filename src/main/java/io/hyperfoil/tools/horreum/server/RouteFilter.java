package io.hyperfoil.tools.horreum.server;

import javax.enterprise.context.ApplicationScoped;
import javax.servlet.FilterChain;
import javax.servlet.ServletException;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpFilter;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/*
   Redirects unknown URLs to the default /index.html so that React can try and render them as part of browser Url History
 */
@WebFilter(urlPatterns = "/*")
@ApplicationScoped
public class RouteFilter extends HttpFilter {
   private static final String[] PATH_PREFIXES = { "/api/", "/connect", "/dev" };
   private static final Pattern FILE_NAME_PATTERN = Pattern.compile(".*[.][a-zA-Z\\d]+");

   public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain) throws IOException, ServletException {
      HttpServletRequest request = (HttpServletRequest) req;
      HttpServletResponse response = (HttpServletResponse) res;
      chain.doFilter(request, response);

      if (response.getStatus() == 404) {
         String path = request.getRequestURI().substring(
            request.getContextPath().length()).replaceAll("[/]+$", "");
         if (Stream.of(PATH_PREFIXES).noneMatch(prefix -> path.startsWith(prefix)) && !FILE_NAME_PATTERN.matcher(path).matches()) {
            // We could not find the resource, i.e. it is not anything known to the server (i.e. it is not a REST
            // endpoint or a servlet), and does not look like a file so try handling it in the front-end routes.
            response.setStatus(200); //force response status when redirecting to /
            request.getRequestDispatcher("/").forward(request, response);
         }
      }
   }
}
